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

export interface ComboboxOption {
  value: string;
  label: string;
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

  const filteredOptions = options
    .filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.label.localeCompare(b.label));

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
          className={cn('w-full justify-between font-normal', className)}
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
                  className="text-muted-foreground"
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
                  className="text-primary"
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
}: MultiComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredOptions = options
    .filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.label.localeCompare(b.label));

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
          className={cn('w-full justify-between font-normal h-auto min-h-9', className)}
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-1 flex-1 items-center">
            {values.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              values.map((val) => {
                const opt = options.find((o) => o.value === val);
                const label = opt?.label || val;
                return (
                  <Badge key={val} variant="secondary" className="gap-1 pr-1 text-xs">
                    {label}
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
                  className="text-muted-foreground"
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
                  className="text-primary"
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
