import { useState } from 'react';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { PersonTooltip } from '@/components/person-tooltip';

export interface ComboboxOption {
  value: string;
  label: string;
  // Optional relevance score (higher = more likely). When set, options sort by it
  // (after prefix matching) so e.g. the meeting participant picker surfaces people
  // you've met with / at NCQA first. Absent → falls back to alphabetical.
  rank?: number;
}

// Highlight for the active row in a combobox dropdown. An explicit light blue
// (matching the notes @-mention picker) instead of the near-white `bg-accent`
// default, whose ~3% contrast was invisible in some browsers/displays (e.g. Edge).
// `cursor-pointer` makes each offered name read as clickable. cmdk sets
// `data-selected` on both keyboard- and mouse-hovered items, so this covers both.
const ITEM_HIGHLIGHT =
  'cursor-pointer data-[selected=true]:bg-blue-100 data-[selected=true]:text-blue-900 dark:data-[selected=true]:bg-blue-500/30 dark:data-[selected=true]:text-blue-50';

// Sort comparator shared by both combobox variants. When the user is searching, a
// word-prefix match ("sar" → "Sarah") beats a mid-word hit ("Ce-sar"); within a
// tier, higher `rank` wins, then alphabetical. With no search / no ranks this is
// just the previous alphabetical order.
function compareOptions(a: ComboboxOption, b: ComboboxOption, q: string) {
  if (q) {
    const ap = (' ' + a.label.toLowerCase()).includes(' ' + q) ? 0 : 1;
    const bp = (' ' + b.label.toLowerCase()).includes(' ' + q) ? 0 : 1;
    if (ap !== bp) return ap - bp;
  }
  const ar = a.rank ?? 0;
  const br = b.rank ?? 0;
  if (ar !== br) return br - ar;
  return a.label.localeCompare(b.label);
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string, isNewEntry: boolean) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  allowFreeText?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  allowFreeText = false,
  disabled = false,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = options.find((o) => o.value === value);
  const displayValue = selected?.label || (value && !selected ? value : '');

  const q = search.toLowerCase().trim();
  const filteredOptions = options
    .filter((o) => o.label.toLowerCase().includes(q))
    .sort((a, b) => compareOptions(a, b, q));

  const showAddOption =
    allowFreeText &&
    search.trim() &&
    !filteredOptions.some((o) => o.label.toLowerCase() === search.toLowerCase());

  const handleSelect = (selectedValue: string, isNew: boolean) => {
    onChange(selectedValue, isNew);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal border-input', className)}
          disabled={disabled}
        >
          <span className={cn(!displayValue && 'text-muted-foreground')}>
            {displayValue || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {showAddOption ? null : emptyMessage}
            </CommandEmpty>
            <CommandGroup>
              {/* Clear option */}
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => handleSelect('', false)}
                  className={cn(ITEM_HIGHLIGHT, 'text-muted-foreground')}
                >
                  Clear selection
                </CommandItem>
              )}
              {/* Existing options */}
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => handleSelect(option.value, false)}
                  className={ITEM_HIGHLIGHT}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
              {/* Add new option */}
              {showAddOption && (
                <CommandItem
                  value={`__new__${search}`}
                  onSelect={() => handleSelect(search.trim(), true)}
                  className={cn(ITEM_HIGHLIGHT, 'text-primary')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add "{search.trim()}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Multi-select variant for selecting multiple items
interface MultiComboboxProps {
  options: ComboboxOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  allowFreeText?: boolean;
  disabled?: boolean;
  className?: string;
  // Optional per-value metadata (keyed by option value) → a hover tooltip on the
  // selected pills showing e.g. a person's pronunciation + title + current employer.
  optionMeta?: Map<string, { pronunciation?: string | null; title?: string | null; employer?: string | null }>;
  // When set, pasting a multi-entry list (separators or `<email>` tokens) into the
  // search box is intercepted and handed off here instead of typed in — lets callers
  // bulk-add (e.g. paste a whole meeting attendee list). Single plain values paste
  // normally so the user can still type-then-Add one at a time.
  onBulkPaste?: (text: string) => void;
}

export function MultiCombobox({
  options,
  values,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found.',
  allowFreeText = false,
  disabled = false,
  className,
  optionMeta,
  onBulkPaste,
}: MultiComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const q = search.toLowerCase().trim();
  const filteredOptions = options
    .filter((o) => o.label.toLowerCase().includes(q))
    .sort((a, b) => compareOptions(a, b, q));

  const showAddOption =
    allowFreeText &&
    search.trim() &&
    !filteredOptions.some((o) => o.label.toLowerCase() === search.toLowerCase()) &&
    !values.includes(search.trim());

  const toggleValue = (val: string) => {
    if (values.includes(val)) {
      onChange(values.filter((v) => v !== val));
    } else {
      onChange([...values, val]);
    }
  };

  const addNewValue = (val: string) => {
    if (!values.includes(val)) {
      onChange([...values, val]);
    }
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal h-auto min-h-9 border-input', className)}
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-1 flex-1 items-center">
            {values.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              values.map((val) => {
                const opt = options.find((o) => o.value === val);
                const label = opt?.label || val;
                const meta = optionMeta?.get(val);
                return (
                  <Badge key={val} variant="secondary" className="gap-1 pr-1 text-xs">
                    <PersonTooltip pronunciation={meta?.pronunciation} title={meta?.title} employer={meta?.employer}>
                      <span>{label}</span>
                    </PersonTooltip>
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onChange(values.filter((v) => v !== val));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          e.preventDefault();
                          onChange(values.filter((v) => v !== val));
                        }
                      }}
                      className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </Badge>
                );
              })
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
            onPaste={
              onBulkPaste
                ? (e) => {
                    const text = e.clipboardData.getData('text')
                    // Only hijack a paste that's clearly a *list* — multiple entries
                    // (`;` / newline) or an `<email>` token. A plain single name still
                    // pastes into the box so type-then-Add keeps working.
                    if (/[;\n]/.test(text) || /<[^>]*@[^>]*>/.test(text)) {
                      e.preventDefault()
                      setSearch('')
                      onBulkPaste(text)
                    }
                  }
                : undefined
            }
          />
          <CommandList>
            <CommandEmpty>
              {showAddOption ? null : emptyMessage}
            </CommandEmpty>
            <CommandGroup>
              {/* Clear all option */}
              {values.length > 0 && (
                <CommandItem
                  value="__clear_all__"
                  onSelect={() => onChange([])}
                  className={cn(ITEM_HIGHLIGHT, 'text-muted-foreground')}
                >
                  Clear all
                </CommandItem>
              )}
              {/* Existing options */}
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => toggleValue(option.value)}
                  className={ITEM_HIGHLIGHT}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      values.includes(option.value) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
              {/* Add new option */}
              {showAddOption && (
                <CommandItem
                  value={`__new__${search}`}
                  onSelect={() => addNewValue(search.trim())}
                  className={cn(ITEM_HIGHLIGHT, 'text-primary')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add "{search.trim()}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
