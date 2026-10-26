import { Plus, Users } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { type GroupOption, matchSuggestions, type Suggestion } from "~/lib/groups";
import { cn } from "~/lib/utils";

export interface ContactSuggestion {
  email: string;
  name: string;
}

interface Props {
  /** Contacts the user has used before (name + email). */
  suggestions: ContactSuggestion[];
  /** Emails already added — filtered out of the suggestions. */
  exclude: string[];
  /** Called with a lowercased email when the user picks a contact or enters a new one. */
  onAdd: (email: string) => void;
  /** Groups to offer by name (bill form only). Omit to suggest people only. */
  groups?: GroupOption[];
  /** Called when the user picks a group. Required with `groups`. */
  onAddGroup?: (group: GroupOption) => void;
}

const NO_GROUPS: GroupOption[] = [];

const isValidEmail = (e: string) => /^\S+@\S+\.\S+$/.test(e);

/**
 * Type-ahead for adding a bill participant. Matches the typed query against both the display name
 * and the email (case-insensitive substring) of previously-used contacts — and, when `groups` is
 * given, against group names — and also accepts a brand-new email typed in full. A complete email
 * always means that person, never a group. Keyboard: ↑/↓ to move, Enter to add, Esc to close.
 */
export function ContactAutosuggest({ suggestions, exclude, onAdd, groups = NO_GROUPS, onAddGroup }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const excludeSet = useMemo(() => new Set(exclude.map((e) => e.toLowerCase())), [exclude]);
  const q = query.trim().toLowerCase();

  const matches = useMemo(
    () => matchSuggestions(q, suggestions, onAddGroup ? groups : NO_GROUPS, exclude),
    [q, suggestions, groups, onAddGroup, exclude],
  );

  function reset() {
    setQuery("");
    setActive(-1);
    setOpen(false);
  }

  function commit(email: string) {
    const e = email.trim().toLowerCase();
    if (!isValidEmail(e) || excludeSet.has(e)) return;
    onAdd(e);
    reset();
  }

  function pick(s: Suggestion) {
    if (s.kind === "group") {
      onAddGroup?.(s);
      reset();
    } else {
      commit(s.email);
    }
  }

  function commitCurrent() {
    if (active >= 0 && matches[active]) return pick(matches[active]);
    if (isValidEmail(q)) return commit(q); // a full new email wins (never a group)
    if (matches.length > 0) return pick(matches[0]); // a name fragment → the top match
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitCurrent();
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const showList = open && matches.length > 0;

  return (
    <div className="relative">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          type="text"
          inputMode="email"
          autoComplete="off"
          placeholder={
            onAddGroup && groups.length > 0 ? "Add by name, email or group" : "Add by name or email"
          }
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
        />
        <Button type="button" variant="outline" onClick={commitCurrent}>
          <Plus className="size-4" /> Add
        </Button>
      </div>

      {showList ? (
        <ul
          role="listbox"
          // Keep the input focused so a click registers before the blur handler closes the list.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.map((m, i) => (
            <li
              key={m.kind === "group" ? `group:${m.id}` : m.email}
              role="option"
              aria-selected={i === active}
            >
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(m)}
                aria-label={
                  m.kind === "group"
                    ? `${m.name}, group of ${m.members.length}`
                    : undefined
                }
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm",
                  i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                {m.kind === "group" ? (
                  <>
                    <span className="flex min-w-0 items-center gap-2">
                      <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate font-medium">{m.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Group · {m.members.length} {m.members.length === 1 ? "person" : "people"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="truncate font-medium">{m.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
