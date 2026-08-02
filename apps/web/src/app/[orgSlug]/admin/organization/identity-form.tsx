"use client";

import { useActionState, useState } from "react";
import { updateOrgIdentityAction } from "@/lib/actions/organization";
import { idle } from "@/lib/actions/types";
import type { OrgIdentity } from "@/lib/org-identity";
import {
  ActionBanner,
  Button,
  Field,
  Input,
  Textarea,
} from "@/components/ui/primitives";

/**
 * Identity editor — culture in, reflected everywhere. Collapsed behind an
 * explicit "Edit identity" affordance so the Hub reads as a place, not a
 * settings form.
 */
export function IdentityForm({
  orgSlug,
  identity,
}: {
  orgSlug: string;
  identity: OrgIdentity;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(
    updateOrgIdentityAction.bind(null, orgSlug),
    idle,
  );

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit identity
        </Button>
        <ActionBanner state={state} />
      </div>
    );
  }

  return (
    <form action={action} className="nk-fade-up space-y-4">
      <Field
        label="Mission"
        htmlFor="mission"
        hint="Why the organization exists — one or two sentences."
      >
        <Textarea
          id="mission"
          name="mission"
          rows={2}
          defaultValue={identity.mission ?? ""}
        />
      </Field>
      <Field label="Vision" htmlFor="vision" hint="Where it is going.">
        <Textarea
          id="vision"
          name="vision"
          rows={2}
          defaultValue={identity.vision ?? ""}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Values" htmlFor="values" hint="One per line, up to 8.">
          <Textarea
            id="values"
            name="values"
            rows={4}
            defaultValue={(identity.values ?? []).join("\n")}
          />
        </Field>
        <Field
          label="Operating principles"
          htmlFor="principles"
          hint="One per line, up to 8."
        >
          <Textarea
            id="principles"
            name="principles"
            rows={4}
            defaultValue={(identity.principles ?? []).join("\n")}
          />
        </Field>
      </div>
      <Field
        label="Voice"
        htmlFor="voice"
        hint="How the organization speaks — guides authors and future Nova drafting."
      >
        <Input id="voice" name="voice" defaultValue={identity.voice ?? ""} />
      </Field>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save identity"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Done
        </Button>
      </div>
      <ActionBanner state={state} />
    </form>
  );
}
