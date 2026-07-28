"use client";

import { useActionState, useState } from "react";
import { saveBrandingAction } from "@/lib/actions/organization";
import { idle } from "@/lib/actions/types";
import {
  ActionBanner,
  Button,
  Field,
  Input,
  Select,
} from "@/components/ui/primitives";

interface BrandingValues {
  display_name: string;
  accent_light: string;
  accent_dark: string;
  font_family: string;
  radius_scale: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function AccentField({
  id,
  name,
  label,
  defaultValue,
  error,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  error?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const valid = HEX.test(value);
  return (
    <Field
      label={label}
      htmlFor={id}
      error={error}
      hint="6-digit hex, e.g. #6d28d9"
    >
      <div className="flex items-center gap-2">
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          pattern="^#[0-9a-fA-F]{6}$"
          className="font-mono"
        />
        <span
          aria-hidden
          className="h-8 w-10 shrink-0 rounded-md border border-border"
          style={valid ? { backgroundColor: value } : undefined}
        />
      </div>
    </Field>
  );
}

export function BrandingForm({
  orgSlug,
  initial,
}: {
  orgSlug: string;
  initial: BrandingValues;
}) {
  const [state, action, pending] = useActionState(
    saveBrandingAction.bind(null, orgSlug),
    idle,
  );

  return (
    <form action={action} className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field
          label="Display name"
          htmlFor="display_name"
          error={state.errors?.display_name}
          hint="Shown in the workspace header instead of the organization name."
        >
          <Input
            id="display_name"
            name="display_name"
            defaultValue={initial.display_name}
          />
        </Field>
      </div>

      <AccentField
        id="accent_light"
        name="accent_light"
        label="Accent — light mode"
        defaultValue={initial.accent_light}
        error={state.errors?.accent_light}
      />
      <AccentField
        id="accent_dark"
        name="accent_dark"
        label="Accent — dark mode"
        defaultValue={initial.accent_dark}
        error={state.errors?.accent_dark}
      />

      <Field
        label="Typeface"
        htmlFor="font_family"
        error={state.errors?.font_family}
      >
        <Select
          id="font_family"
          name="font_family"
          defaultValue={initial.font_family}
        >
          <option value="geist">Geist (NovaKore default)</option>
          <option value="system">System</option>
          <option value="serif">Serif</option>
        </Select>
      </Field>

      <Field
        label="Corner radius"
        htmlFor="radius_scale"
        error={state.errors?.radius_scale}
      >
        <Select
          id="radius_scale"
          name="radius_scale"
          defaultValue={initial.radius_scale}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </Select>
      </Field>

      <div className="sm:col-span-2">
        <ActionBanner state={state} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save branding"}
        </Button>
      </div>
    </form>
  );
}
