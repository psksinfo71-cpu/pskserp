'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import type { ChartAccount } from '@/lib/types';

interface AccountComboboxProps {
  accounts: ChartAccount[];
  value: string;
  onChange: (accountId: string) => void;
  placeholder?: string;
  className?: string;
}

export const AccountCombobox = React.memo(function AccountCombobox({ accounts, value, onChange, placeholder = 'Select account', className }: AccountComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const selected = accounts.find((a) => a.id === value);

  const grouped = React.useMemo(() => {
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const childrenByParent = new Map<string | null, ChartAccount[]>();
    for (const a of accounts) {
      const pid = a.parent_id ?? null;
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
      childrenByParent.get(pid)!.push(a);
    }
    const groups: { parent: ChartAccount | null; items: ChartAccount[] }[] = [];
    const visited = new Set<string>();
    const buildGroup = (parentId: string | null, depth: number) => {
      const children = childrenByParent.get(parentId) ?? [];
      const leafs = children.filter((a) => !a.is_group);
      const groupsInChildren = children.filter((a) => a.is_group);
      if (leafs.length > 0) {
        const parent = parentId ? byId.get(parentId) ?? null : null;
        groups.push({ parent, items: leafs });
      }
      for (const g of groupsInChildren) {
        if (visited.has(g.id)) continue;
        visited.add(g.id);
        buildGroup(g.id, depth + 1);
      }
    };
    buildGroup(null, 0);
    // Pick up orphan branches whose parent_id is not in the account list
    for (const [pid, _] of childrenByParent) {
      if (pid !== null && !byId.has(pid) && !visited.has(pid)) {
        buildGroup(pid, 0);
      }
    }
    return groups;
  }, [accounts]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    const filteredGroups: typeof grouped = [];
    for (const g of grouped) {
      const items = g.items.filter((a) =>
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        (g.parent?.name.toLowerCase().includes(q) ?? false)
      );
      if (items.length > 0) filteredGroups.push({ parent: g.parent, items });
    }
    return filteredGroups;
  }, [grouped, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
        >
          <span className="truncate">
            {selected ? `${selected.code} - ${selected.name}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Search by name or code..."
              value={search}
              onValueChange={setSearch}
              className="flex h-9 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            {filtered.map((g, gi) => (
              <CommandGroup key={gi} heading={g.parent ? `${g.parent.code} - ${g.parent.name}` : undefined}>
                {g.items.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={a.id}
                    onSelect={() => {
                      onChange(a.id === value ? '' : a.id);
                      setOpen(false);
                      setSearch('');
                    }}
                    className="gap-2"
                  >
                    <Check className={cn('h-4 w-4 shrink-0', value === a.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
                    <span className="truncate">{a.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
