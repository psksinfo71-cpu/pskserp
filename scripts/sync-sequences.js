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

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log("Connecting to Supabase at:", supabaseUrl);

  const authRes = await supabase.auth.signInWithPassword({
    email: "psksinfo71@gmail.com",
    password: "Admin@2026",
  });

  if (authRes.error) {
    console.error("Authentication failed:", authRes.error.message);
    process.exit(1);
  }

  // 1. Fetch all vouchers
  const { data: vouchers, error: vErr } = await supabase
    .from("vouchers")
    .select(
      "id, voucher_no, voucher_type, voucher_date, branch_id, project_id",
    );

  if (vErr) {
    console.error("Failed to fetch vouchers:", vErr.message);
    process.exit(1);
  }

  // Count max per (voucher_type, fy, office_type, branch_id)
  const counts = {};
  for (const v of vouchers) {
    const match = v.voucher_no.match(
      /^(HQ|BO-[^-]+)-([A-Z]+)-([0-9-]+)-([0-9]+)$/,
    );
    if (match) {
      const [_, officePrefix, vType, fy, seqStr] = match;
      const key = `${officePrefix}-${vType}-${fy}`;
      const seq = parseInt(seqStr, 10);
      counts[key] = {
        office_type: officePrefix === "HQ" ? "head_office" : "branch_office",
        voucher_type: vType,
        financial_year: fy,
        branch_id: v.branch_id || null,
        project_id: v.project_id || null,
        maxSeq: Math.max(counts[key]?.maxSeq || 0, seq),
      };
    }
  }

  console.log("Voucher counts summary:", counts);

  // Sync with voucher_number_sequences
  for (const [key, info] of Object.entries(counts)) {
    // Delete existing matching rows to clear duplicates
    await supabase
      .from("voucher_number_sequences")
      .delete()
      .eq("financial_year", info.financial_year)
      .eq("voucher_type", info.voucher_type);

    // Insert clean row
    const { error: insErr } = await supabase
      .from("voucher_number_sequences")
      .insert({
        financial_year: info.financial_year,
        project_id: null,
        branch_id: null,
        office_type: info.office_type,
        voucher_type: info.voucher_type,
        last_seq: info.maxSeq,
        updated_at: new Date().toISOString(),
      });

    if (insErr) {
      console.log(`Failed to insert sequence for ${key}:`, insErr.message);
    } else {
      console.log(`[Synced Sequence] ${key} -> last_seq = ${info.maxSeq}`);
    }
  }

  console.log("\nAll sequence counters are now successfully synchronized!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
