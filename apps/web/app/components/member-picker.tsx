import { X } from "lucide-react";
import { ContactAutosuggest, type ContactSuggestion } from "~/components/contact-autosuggest";

interface Props {
  /** Emails picked so far (lowercased). */
  value: string[];
  onChange: (emails: string[]) => void;
  /** People you share history with — the only ones shown by name. */
  suggestions: ContactSuggestion[];
  /** Emails that can't be picked (e.g. you, or people already in the group). */
  exclude: string[];
}

/** Chips + type-ahead for choosing group members. People only — a group can't contain a group. */
export function MemberPicker({ value, onChange, suggestions, exclude }: Props) {
  const nameOf = (email: string) => suggestions.find((s) => s.email === email)?.name ?? email;
  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((email) => (
            <li
              key={email}
              title={email}
              className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground"
            >
              <span>{nameOf(email)}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((e) => e !== email))}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${nameOf(email)}`}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ContactAutosuggest
        suggestions={suggestions}
        exclude={[...exclude, ...value]}
        onAdd={(email) => onChange([...value, email])}
      />
    </div>
  );
}
