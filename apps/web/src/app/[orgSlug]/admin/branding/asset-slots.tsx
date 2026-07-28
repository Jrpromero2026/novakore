"use client";

/* eslint-disable @next/next/no-img-element -- signed-URL brand assets are
   intentionally rendered through plain <img>: image contexts never execute
   SVG scripts, which is part of the documented SVG defense stack. */

import { useActionState, useRef, useState, useTransition } from "react";
import {
  ASSET_POLICY,
  formatBytes,
  validateAssetUpload,
  type AssetKind,
} from "@novakore/domain";
import {
  archiveBrandAssetAction,
  uploadBrandAssetAction,
} from "@/lib/actions/branding";
import { idle, type ActionState } from "@/lib/actions/types";
import { ActionBanner, Button } from "@/components/ui/primitives";
import { ConfirmButton } from "@/components/ui/feedback";

export interface AssetSlotView {
  kind: AssetKind;
  label: string;
  guidance: string;
  current: {
    id: string;
    signedUrl: string | null;
    originalFilename: string;
    byteSize: number;
    width: number | null;
    height: number | null;
    altText: string | null;
  } | null;
}

export function AssetSlot({
  orgSlug,
  slot,
}: {
  orgSlug: string;
  slot: AssetSlotView;
}) {
  const [state, formAction, pending] = useActionState(
    uploadBrandAssetAction.bind(null, orgSlug),
    idle,
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const [archiveState, setArchiveState] = useState<ActionState>(idle);
  const [archivePending, startArchive] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const policy = ASSET_POLICY[slot.kind];

  // Advisory pre-check for fast feedback; the server re-validates everything.
  const onFileChosen = (file: File | null) => {
    setClientError(null);
    if (!file) return;
    const verdict = validateAssetUpload({
      kind: slot.kind,
      mimeType: file.type,
      byteSize: file.size,
      filename: file.name,
      // Dimensions are decoded server-side; pass-through values here.
      width: null,
      height: null,
    });
    if (!verdict.ok && !verdict.error.includes("decoded")) {
      setClientError(verdict.error);
    }
  };

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-title text-text-primary">{slot.label}</p>
          <p className="mt-0.5 text-caption text-text-muted">
            {slot.guidance} · up to {formatBytes(policy.maxBytes)}
          </p>
          {slot.current ? (
            <p className="mt-1 font-mono text-caption text-text-secondary">
              {slot.current.originalFilename} ·{" "}
              {formatBytes(slot.current.byteSize)}
              {slot.current.width && slot.current.height
                ? ` · ${slot.current.width}×${slot.current.height}`
                : ""}
            </p>
          ) : (
            <p className="mt-1 text-caption text-text-muted">
              Not set — the platform fallback renders instead.
            </p>
          )}
        </div>

        {slot.current?.signedUrl ? (
          <span className="flex h-14 w-28 items-center justify-center overflow-hidden rounded-md border border-border-default bg-background-subtle p-1.5">
            <img
              src={slot.current.signedUrl}
              alt={slot.current.altText ?? `${slot.label} preview`}
              className="max-h-full max-w-full object-contain"
            />
          </span>
        ) : null}

        <div className="flex items-center gap-1.5">
          <form action={formAction} className="flex items-center gap-1.5">
            <input type="hidden" name="kind" value={slot.kind} />
            <label className="sr-only" htmlFor={`file-${slot.kind}`}>
              Upload {slot.label}
            </label>
            <input
              ref={fileInputRef}
              id={`file-${slot.kind}`}
              name="file"
              type="file"
              accept={policy.mimeTypes.join(",")}
              onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)}
              className="max-w-52 text-caption text-text-secondary file:mr-2 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-2.5 file:py-1.5 file:text-caption file:font-medium file:text-text-primary hover:file:bg-surface-interactive"
            />
            <Button
              type="submit"
              variant="secondary"
              className="text-xs"
              disabled={pending}
            >
              {pending ? "Uploading…" : slot.current ? "Replace" : "Upload"}
            </Button>
          </form>
          {slot.current ? (
            <ConfirmButton
              label="Archive"
              confirmLabel="Archive it"
              description="The slot falls back to the platform default; history is kept."
              className="text-xs"
              disabled={archivePending}
              onConfirm={() =>
                startArchive(async () =>
                  setArchiveState(
                    await archiveBrandAssetAction(orgSlug, slot.current!.id),
                  ),
                )
              }
            />
          ) : null}
        </div>
      </div>

      <div className="mt-2 space-y-1.5 empty:hidden">
        {clientError ? (
          <p role="alert" className="text-caption text-danger">
            {clientError}
          </p>
        ) : null}
        <ActionBanner state={state} />
        <ActionBanner state={archiveState} />
      </div>
    </li>
  );
}
