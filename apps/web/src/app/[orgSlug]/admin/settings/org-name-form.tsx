"use client";

import { useActionState } from "react";
import { updateOrganizationNameAction } from "@/lib/actions/organization";
import { idle } from "@/lib/actions/types";
import { ActionBanner, Button, Field, Input } from "@/components/ui/primitives";
import { tourTarget, TOUR_TARGETS } from "@/lib/onboarding/targets";

export function OrgNameForm({
  orgSlug,
  currentName,
}: {
  orgSlug: string;
  currentName: string;
}) {
  const [state, action, pending] = useActionState(
    updateOrganizationNameAction.bind(null, orgSlug),
    idle,
  );

  return (
    <form action={action} className="flex max-w-md flex-col gap-3">
      <Field
        label="Organization name"
        htmlFor="org-name"
        error={state.errors?.name}
      >
        <Input
          id="org-name"
          name="name"
          defaultValue={currentName}
          required
          minLength={2}
          {...tourTarget(TOUR_TARGETS.settingsNameField)}
        />
      </Field>
      <ActionBanner state={state} />
      <div>
        <Button
          type="submit"
          disabled={pending}
          {...tourTarget(TOUR_TARGETS.settingsSaveButton)}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
