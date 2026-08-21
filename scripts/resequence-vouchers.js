const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

// Read .env file
const envFile = fs.readFileSync(".env", "utf8");
const env = {};
for (const line of envFile.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const supabaseUrl =
  env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log("Connecting to Supabase at:", supabaseUrl);

  const authEmail = process.env.SUPABASE_SCRIPT_EMAIL || env.SUPABASE_SCRIPT_EMAIL;
  const authPassword = process.env.SUPABASE_SCRIPT_PASSWORD || env.SUPABASE_SCRIPT_PASSWORD;
  if (!authEmail || !authPassword) {
    console.error("Set SUPABASE_SCRIPT_EMAIL and SUPABASE_SCRIPT_PASSWORD in .env or environment");
    process.exit(1);
  }

  const authRes = await supabase.auth.signInWithPassword({
    email: authEmail,
    password: authPassword,
  });

  if (authRes.error) {
    console.error("Authentication failed:", authRes.error.message);
    process.exit(1);
  }

  console.log("Successfully authenticated as:", authRes.data.user.email);

  // 1. Fetch all vouchers with branch and details
  const { data: vouchers, error: vErr } = await supabase
    .from("vouchers")
    .select(
      "*, branch: branches ( id, code, office_type ), details: voucher_details ( id, account_id, debit, credit, account: chart_of_accounts ( code, name ) )",
    );

  if (vErr) {
    console.error("Failed to fetch vouchers:", vErr.message);
    process.exit(1);
  }

  console.log(`Found ${vouchers.length} total vouchers in database.`);

  // 2. Classify legacy PV / RV types
  const mappedVouchers = vouchers.map((v) => {
    let finalType = v.voucher_type;
    if (v.voucher_type === "PV") {
      const hasBank = (v.details || []).some(
        (d) =>
          d.account?.code?.startsWith("1002") ||
          d.account?.code?.startsWith("112"),
      );
      const hasCash = (v.details || []).some(
        (d) =>
          d.account?.code?.startsWith("1001") ||
          d.account?.code?.startsWith("111"),
      );
      finalType = hasCash && !hasBank ? "CPV" : "BPV";
    } else if (v.voucher_type === "RV") {
      const hasCash = (v.details || []).some(
        (d) =>
          d.account?.code?.startsWith("1001") ||
          d.account?.code?.startsWith("111"),
      );
      finalType = hasCash ? "CRV" : "BRV";
    }

    const d = new Date(`${v.voucher_date}T00:00:00`);
    const year = d.getFullYear();
    const fy =
      d.getMonth() >= 6
        ? `${year}-${String(year + 1).slice(-2)}`
        : `${year - 1}-${String(year).slice(-2)}`;

    const isHQ = !v.branch_id || v.branch?.office_type === "head_office";
    const branchCode = v.branch?.code || "BO000";
    const prefix = isHQ
      ? `HQ-${finalType}-${fy}-`
      : `BO-${branchCode}-${finalType}-${fy}-`;

    return {
      ...v,
      finalType,
      fy,
      isHQ,
      branchCode,
      prefix,
    };
  });

  // 3. Group by prefix and assign strict 1, 2, 3... sequence
  const groups = {};
  for (const v of mappedVouchers) {
    if (!groups[v.prefix]) groups[v.prefix] = [];
    groups[v.prefix].push(v);
  }

  const updates = [];
  for (const [prefix, list] of Object.entries(groups)) {
    // Sort strictly by voucher_date ASC, created_at ASC, id ASC
    list.sort((a, b) => {
      const dateCmp = a.voucher_date.localeCompare(b.voucher_date);
      if (dateCmp !== 0) return dateCmp;
      const createdCmp = (a.created_at || "").localeCompare(b.created_at || "");
      if (createdCmp !== 0) return createdCmp;
      return a.id.localeCompare(b.id);
    });

    list.forEach((v, idx) => {
      const seq = idx + 1;
      const newVoucherNo = `${prefix}${String(seq).padStart(6, "0")}`;
      updates.push({
        id: v.id,
        old_no: v.voucher_no,
        new_no: newVoucherNo,
        voucher_type: v.finalType,
        prefix,
        seq,
      });
    });
  }

  console.log(`Prepared ${updates.length} voucher updates.`);

  // 4. Update to temporary numbers first to avoid unique constraint collisions
  for (const u of updates) {
    const tempNo = `TEMP-${u.id}-${Date.now()}`;
    const { error } = await supabase
      .from("vouchers")
      .update({ voucher_no: tempNo })
      .eq("id", u.id);
    if (error) {
      console.error(
        `Failed to set temp voucher_no for ${u.id}:`,
        error.message,
      );
    }
  }

  // 5. Update to final normalized voucher_no and voucher_type
  let successCount = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("vouchers")
      .update({ voucher_no: u.new_no, voucher_type: u.voucher_type })
      .eq("id", u.id);

    if (error) {
      console.error(
        `Failed to update voucher ${u.id} to ${u.new_no}:`,
        error.message,
      );
    } else {
      successCount++;
      console.log(`[OK] ${u.old_no} -> ${u.new_no} (${u.voucher_type})`);
    }
  }

  console.log(
    `\nSuccessfully renumbered ${successCount} of ${updates.length} vouchers!`,
  );

  // 6. Update voucher_number_sequences table
  for (const [prefix, list] of Object.entries(groups)) {
    const maxSeq = list.length;
    const first = list[0];
    const { error } = await supabase.from("voucher_number_sequences").upsert(
      {
        sequence_key: prefix,
        financial_year: first.fy,
        project_id: null,
        branch_id: first.isHQ ? null : first.branch_id,
        office_type: first.isHQ ? "head_office" : "branch_office",
        voucher_type: first.finalType,
        last_seq: maxSeq,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sequence_key" },
    );

    if (error) {
      console.log(`Sequence upsert note for ${prefix}:`, error.message);
    } else {
      console.log(`[Sequence Synced] ${prefix} -> last_seq = ${maxSeq}`);
    }
  }

  console.log(
    "\nAll existing vouchers and sequence counters are now clean and sequential!",
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
