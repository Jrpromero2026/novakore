/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: novakore-dev database schema (supabase/migrations are the source
 * of truth). Regenerate with `npm run db:types`; verify freshness with
 * `npm run db:types:check` (see docs/development/supabase.md).
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      academies: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          slug: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "academies_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      analytics_events: {
        Row: {
          actor_user_id: string | null;
          causation_id: string | null;
          context: Json;
          correlation_id: string | null;
          data: Json;
          id: string;
          idempotency_key: string;
          occurred_at: string;
          organization_id: string;
          received_at: string;
          subject_id: string;
          subject_kind: string;
          type: string;
          v: number;
        };
        Insert: {
          actor_user_id?: string | null;
          causation_id?: string | null;
          context?: Json;
          correlation_id?: string | null;
          data?: Json;
          id?: string;
          idempotency_key: string;
          occurred_at?: string;
          organization_id: string;
          received_at?: string;
          subject_id: string;
          subject_kind: string;
          type: string;
          v?: number;
        };
        Update: {
          actor_user_id?: string | null;
          causation_id?: string | null;
          context?: Json;
          correlation_id?: string | null;
          data?: Json;
          id?: string;
          idempotency_key?: string;
          occurred_at?: string;
          organization_id?: string;
          received_at?: string;
          subject_id?: string;
          subject_kind?: string;
          type?: string;
          v?: number;
        };
        Relationships: [
          {
            foreignKeyName: "analytics_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      assessment_versions: {
        Row: {
          assessment_id: string;
          created_at: string;
          id: string;
          items: Json;
          organization_id: string;
          published_at: string;
          published_by: string;
          settings: Json;
          title: string;
          version_number: number;
        };
        Insert: {
          assessment_id: string;
          created_at?: string;
          id?: string;
          items?: Json;
          organization_id: string;
          published_at?: string;
          published_by: string;
          settings?: Json;
          title: string;
          version_number: number;
        };
        Update: {
          assessment_id?: string;
          created_at?: string;
          id?: string;
          items?: Json;
          organization_id?: string;
          published_at?: string;
          published_by?: string;
          settings?: Json;
          title?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_versions_assessment_id_fkey";
            columns: ["assessment_id"];
            isOneToOne: false;
            referencedRelation: "assessments";
            referencedColumns: ["id"];
          },
        ];
      };
      assessments: {
        Row: {
          archived_at: string | null;
          assessment_type: string;
          created_at: string;
          created_by: string | null;
          current_published_version_id: string | null;
          id: string;
          organization_id: string;
          settings: Json;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          assessment_type: string;
          created_at?: string;
          created_by?: string | null;
          current_published_version_id?: string | null;
          id?: string;
          organization_id: string;
          settings?: Json;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          assessment_type?: string;
          created_at?: string;
          created_by?: string | null;
          current_published_version_id?: string | null;
          id?: string;
          organization_id?: string;
          settings?: Json;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessments_current_published_version_fk";
            columns: ["current_published_version_id"];
            isOneToOne: false;
            referencedRelation: "assessment_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_user_id: string | null;
          correlation_id: string | null;
          created_at: string;
          id: string;
          metadata: Json;
          organization_id: string | null;
          target_id: string | null;
          target_type: string;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          organization_id?: string | null;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          organization_id?: string | null;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      content_blocks: {
        Row: {
          block_type: string;
          created_at: string;
          data: Json;
          id: string;
          lesson_id: string;
          organization_id: string;
          position: string;
          schema_version: number;
          updated_at: string;
        };
        Insert: {
          block_type: string;
          created_at?: string;
          data: Json;
          id?: string;
          lesson_id: string;
          organization_id: string;
          position: string;
          schema_version: number;
          updated_at?: string;
        };
        Update: {
          block_type?: string;
          created_at?: string;
          data?: Json;
          id?: string;
          lesson_id?: string;
          organization_id?: string;
          position?: string;
          schema_version?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_blocks_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      course_versions: {
        Row: {
          completion_rule: Json;
          course_id: string;
          created_at: string;
          id: string;
          organization_id: string;
          published_at: string;
          published_by: string;
          structure: Json;
          summary: string | null;
          supersedes_version_id: string | null;
          title: string;
          version_number: number;
        };
        Insert: {
          completion_rule: Json;
          course_id: string;
          created_at?: string;
          id?: string;
          organization_id: string;
          published_at?: string;
          published_by: string;
          structure: Json;
          summary?: string | null;
          supersedes_version_id?: string | null;
          title: string;
          version_number: number;
        };
        Update: {
          completion_rule?: Json;
          course_id?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          published_at?: string;
          published_by?: string;
          structure?: Json;
          summary?: string | null;
          supersedes_version_id?: string | null;
          title?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "course_versions_course_id_fkey";
            columns: ["course_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_versions_supersedes_version_id_fkey";
            columns: ["supersedes_version_id"];
            isOneToOne: false;
            referencedRelation: "course_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      courses: {
        Row: {
          allow_self_enrollment: boolean;
          archived_at: string | null;
          completion_rule: Json;
          created_at: string;
          created_by: string | null;
          current_published_version_id: string | null;
          description: string | null;
          id: string;
          organization_id: string;
          slug: string;
          status: string;
          summary: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          allow_self_enrollment?: boolean;
          archived_at?: string | null;
          completion_rule?: Json;
          created_at?: string;
          created_by?: string | null;
          current_published_version_id?: string | null;
          description?: string | null;
          id?: string;
          organization_id: string;
          slug: string;
          status?: string;
          summary?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          allow_self_enrollment?: boolean;
          archived_at?: string | null;
          completion_rule?: Json;
          created_at?: string;
          created_by?: string | null;
          current_published_version_id?: string | null;
          description?: string | null;
          id?: string;
          organization_id?: string;
          slug?: string;
          status?: string;
          summary?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "courses_current_published_version_fk";
            columns: ["current_published_version_id"];
            isOneToOne: false;
            referencedRelation: "course_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "courses_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      enrollments: {
        Row: {
          assigned_by: string | null;
          completed_at: string | null;
          course_id: string | null;
          created_at: string;
          due_at: string | null;
          id: string;
          learning_path_id: string | null;
          membership_id: string;
          organization_id: string;
          pinned_course_version_id: string | null;
          source: string;
          started_at: string | null;
          status: string;
          target_type: string;
          updated_at: string;
        };
        Insert: {
          assigned_by?: string | null;
          completed_at?: string | null;
          course_id?: string | null;
          created_at?: string;
          due_at?: string | null;
          id?: string;
          learning_path_id?: string | null;
          membership_id: string;
          organization_id: string;
          pinned_course_version_id?: string | null;
          source: string;
          started_at?: string | null;
          status?: string;
          target_type: string;
          updated_at?: string;
        };
        Update: {
          assigned_by?: string | null;
          completed_at?: string | null;
          course_id?: string | null;
          created_at?: string;
          due_at?: string | null;
          id?: string;
          learning_path_id?: string | null;
          membership_id?: string;
          organization_id?: string;
          pinned_course_version_id?: string | null;
          source?: string;
          started_at?: string | null;
          status?: string;
          target_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_organization_id_fkey";
            columns: ["course_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "enrollments_learning_path_id_organization_id_fkey";
            columns: ["learning_path_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "learning_paths";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "enrollments_membership_id_organization_id_fkey";
            columns: ["membership_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "enrollments_pinned_course_version_id_fkey";
            columns: ["pinned_course_version_id"];
            isOneToOne: false;
            referencedRelation: "course_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      learning_paths: {
        Row: {
          academy_id: string;
          allow_self_enrollment: boolean;
          archived_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          learning_system_id: string;
          organization_id: string;
          slug: string;
          status: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          academy_id: string;
          allow_self_enrollment?: boolean;
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          learning_system_id: string;
          organization_id: string;
          slug: string;
          status?: string;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          academy_id?: string;
          allow_self_enrollment?: boolean;
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          learning_system_id?: string;
          organization_id?: string;
          slug?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "learning_paths_academy_id_organization_id_fkey";
            columns: ["academy_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "academies";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "learning_paths_learning_system_id_organization_id_fkey";
            columns: ["learning_system_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "learning_systems";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      learning_systems: {
        Row: {
          academy_id: string;
          archived_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          organization_id: string;
          slug: string;
          status: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          academy_id: string;
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          organization_id: string;
          slug: string;
          status?: string;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          academy_id?: string;
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          organization_id?: string;
          slug?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "learning_systems_academy_id_organization_id_fkey";
            columns: ["academy_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "academies";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      lesson_versions: {
        Row: {
          blocks: Json;
          course_id: string;
          created_at: string;
          estimated_minutes: number | null;
          id: string;
          lesson_id: string;
          organization_id: string;
          published_at: string;
          published_by: string;
          required: boolean;
          summary: string | null;
          title: string;
          version_number: number;
        };
        Insert: {
          blocks: Json;
          course_id: string;
          created_at?: string;
          estimated_minutes?: number | null;
          id?: string;
          lesson_id: string;
          organization_id: string;
          published_at?: string;
          published_by: string;
          required?: boolean;
          summary?: string | null;
          title: string;
          version_number: number;
        };
        Update: {
          blocks?: Json;
          course_id?: string;
          created_at?: string;
          estimated_minutes?: number | null;
          id?: string;
          lesson_id?: string;
          organization_id?: string;
          published_at?: string;
          published_by?: string;
          required?: boolean;
          summary?: string | null;
          title?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_versions_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      lessons: {
        Row: {
          archived_at: string | null;
          course_id: string;
          created_at: string;
          created_by: string | null;
          current_published_version_id: string | null;
          estimated_minutes: number | null;
          id: string;
          module_id: string;
          organization_id: string;
          position: string;
          required: boolean;
          status: string;
          summary: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          archived_at?: string | null;
          course_id: string;
          created_at?: string;
          created_by?: string | null;
          current_published_version_id?: string | null;
          estimated_minutes?: number | null;
          id?: string;
          module_id: string;
          organization_id: string;
          position: string;
          required?: boolean;
          status?: string;
          summary?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          archived_at?: string | null;
          course_id?: string;
          created_at?: string;
          created_by?: string | null;
          current_published_version_id?: string | null;
          estimated_minutes?: number | null;
          id?: string;
          module_id?: string;
          organization_id?: string;
          position?: string;
          required?: boolean;
          status?: string;
          summary?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_organization_id_fkey";
            columns: ["course_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "lessons_current_published_version_fk";
            columns: ["current_published_version_id"];
            isOneToOne: false;
            referencedRelation: "lesson_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lessons_module_id_course_id_fkey";
            columns: ["module_id", "course_id"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["id", "course_id"];
          },
        ];
      };
      media_assets: {
        Row: {
          academy_id: string | null;
          alt_text: string | null;
          archived_at: string | null;
          asset_kind: string;
          byte_size: number;
          checksum: string | null;
          created_at: string;
          created_by: string | null;
          height: number | null;
          id: string;
          mime_type: string;
          organization_id: string | null;
          original_filename: string;
          owner_user_id: string | null;
          replaced_by_asset_id: string | null;
          status: string;
          storage_bucket: string;
          storage_path: string;
          updated_at: string;
          width: number | null;
        };
        Insert: {
          academy_id?: string | null;
          alt_text?: string | null;
          archived_at?: string | null;
          asset_kind: string;
          byte_size: number;
          checksum?: string | null;
          created_at?: string;
          created_by?: string | null;
          height?: number | null;
          id?: string;
          mime_type: string;
          organization_id?: string | null;
          original_filename: string;
          owner_user_id?: string | null;
          replaced_by_asset_id?: string | null;
          status?: string;
          storage_bucket: string;
          storage_path: string;
          updated_at?: string;
          width?: number | null;
        };
        Update: {
          academy_id?: string | null;
          alt_text?: string | null;
          archived_at?: string | null;
          asset_kind?: string;
          byte_size?: number;
          checksum?: string | null;
          created_at?: string;
          created_by?: string | null;
          height?: number | null;
          id?: string;
          mime_type?: string;
          organization_id?: string | null;
          original_filename?: string;
          owner_user_id?: string | null;
          replaced_by_asset_id?: string | null;
          status?: string;
          storage_bucket?: string;
          storage_path?: string;
          updated_at?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_academy_id_organization_id_fkey";
            columns: ["academy_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "academies";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "media_assets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_assets_replaced_by_asset_id_fkey";
            columns: ["replaced_by_asset_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id"];
          },
        ];
      };
      modules: {
        Row: {
          archived_at: string | null;
          course_id: string;
          created_at: string;
          description: string | null;
          id: string;
          organization_id: string;
          position: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          course_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          organization_id: string;
          position: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          course_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          organization_id?: string;
          position?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "modules_course_id_organization_id_fkey";
            columns: ["course_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      organization_branding: {
        Row: {
          accent_dark: string;
          accent_light: string;
          display_name: string | null;
          draft_updated_at: string | null;
          draft_updated_by: string | null;
          font_family: string;
          logo_path: string | null;
          organization_id: string;
          published_at: string | null;
          published_by: string | null;
          radius_scale: string;
          secondary_accent_dark: string | null;
          secondary_accent_light: string | null;
          theme_draft: Json | null;
          theme_published: Json | null;
          theme_schema_version: number;
          updated_at: string;
        };
        Insert: {
          accent_dark?: string;
          accent_light?: string;
          display_name?: string | null;
          draft_updated_at?: string | null;
          draft_updated_by?: string | null;
          font_family?: string;
          logo_path?: string | null;
          organization_id: string;
          published_at?: string | null;
          published_by?: string | null;
          radius_scale?: string;
          secondary_accent_dark?: string | null;
          secondary_accent_light?: string | null;
          theme_draft?: Json | null;
          theme_published?: Json | null;
          theme_schema_version?: number;
          updated_at?: string;
        };
        Update: {
          accent_dark?: string;
          accent_light?: string;
          display_name?: string | null;
          draft_updated_at?: string | null;
          draft_updated_by?: string | null;
          font_family?: string;
          logo_path?: string | null;
          organization_id?: string;
          published_at?: string | null;
          published_by?: string | null;
          radius_scale?: string;
          secondary_accent_dark?: string | null;
          secondary_accent_light?: string | null;
          theme_draft?: Json | null;
          theme_published?: Json | null;
          theme_schema_version?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_branding_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_member_roles: {
        Row: {
          academy_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          membership_id: string;
          organization_id: string;
          role_id: string;
        };
        Insert: {
          academy_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          membership_id: string;
          organization_id: string;
          role_id: string;
        };
        Update: {
          academy_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          membership_id?: string;
          organization_id?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_member_roles_academy_id_organization_id_fkey";
            columns: ["academy_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "academies";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "organization_member_roles_membership_id_organization_id_fkey";
            columns: ["membership_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "organization_member_roles_role_id_organization_id_fkey";
            columns: ["role_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_roles";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      organization_memberships: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          invited_at: string | null;
          invited_email: string | null;
          organization_id: string;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invited_at?: string | null;
          invited_email?: string | null;
          organization_id: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invited_at?: string | null;
          invited_email?: string | null;
          organization_id?: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_role_permissions: {
        Row: {
          created_at: string;
          created_by: string | null;
          organization_id: string;
          permission_code: string;
          role_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          organization_id: string;
          permission_code: string;
          role_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          organization_id?: string;
          permission_code?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_role_permissions_permission_code_fkey";
            columns: ["permission_code"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "organization_role_permissions_role_id_organization_id_fkey";
            columns: ["role_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_roles";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      organization_roles: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_system: boolean;
          key: string;
          name: string;
          organization_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_system?: boolean;
          key: string;
          name: string;
          organization_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_system?: boolean;
          key?: string;
          name?: string;
          organization_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_roles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_settings: {
        Row: {
          default_locale: string;
          organization_id: string;
          settings: Json;
          updated_at: string;
        };
        Insert: {
          default_locale?: string;
          organization_id: string;
          settings?: Json;
          updated_at?: string;
        };
        Update: {
          default_locale?: string;
          organization_id?: string;
          settings?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_terminology: {
        Row: {
          organization_id: string;
          plural: string;
          short_form: string | null;
          singular: string;
          term_key: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          plural: string;
          short_form?: string | null;
          singular: string;
          term_key: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          plural?: string;
          short_form?: string | null;
          singular?: string;
          term_key?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_terminology_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      outbox_events: {
        Row: {
          attempt_count: number;
          available_at: string;
          created_at: string;
          event_type: string;
          event_version: number;
          id: string;
          last_error: string | null;
          organization_id: string;
          payload: Json;
          processed_at: string | null;
          status: string;
        };
        Insert: {
          attempt_count?: number;
          available_at?: string;
          created_at?: string;
          event_type: string;
          event_version?: number;
          id?: string;
          last_error?: string | null;
          organization_id: string;
          payload: Json;
          processed_at?: string | null;
          status?: string;
        };
        Update: {
          attempt_count?: number;
          available_at?: string;
          created_at?: string;
          event_type?: string;
          event_version?: number;
          id?: string;
          last_error?: string | null;
          organization_id?: string;
          payload?: Json;
          processed_at?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      path_nodes: {
        Row: {
          course_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          organization_id: string;
          path_id: string;
          position: string;
        };
        Insert: {
          course_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id: string;
          path_id: string;
          position: string;
        };
        Update: {
          course_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
          path_id?: string;
          position?: string;
        };
        Relationships: [
          {
            foreignKeyName: "path_nodes_course_id_organization_id_fkey";
            columns: ["course_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "path_nodes_path_id_organization_id_fkey";
            columns: ["path_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "learning_paths";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      permissions: {
        Row: {
          category: string;
          code: string;
          created_at: string;
          description: string;
        };
        Insert: {
          category: string;
          code: string;
          created_at?: string;
          description: string;
        };
        Update: {
          category?: string;
          code?: string;
          created_at?: string;
          description?: string;
        };
        Relationships: [];
      };
      platform_administrators: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      prerequisites: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          node_id: string;
          organization_id: string;
          path_id: string;
          requirement: string;
          requires_node_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          node_id: string;
          organization_id: string;
          path_id: string;
          requirement?: string;
          requires_node_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          node_id?: string;
          organization_id?: string;
          path_id?: string;
          requirement?: string;
          requires_node_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prerequisites_node_id_path_id_fkey";
            columns: ["node_id", "path_id"];
            isOneToOne: false;
            referencedRelation: "path_nodes";
            referencedColumns: ["id", "path_id"];
          },
          {
            foreignKeyName: "prerequisites_path_id_organization_id_fkey";
            columns: ["path_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "learning_paths";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "prerequisites_requires_node_id_path_id_fkey";
            columns: ["requires_node_id", "path_id"];
            isOneToOne: false;
            referencedRelation: "path_nodes";
            referencedColumns: ["id", "path_id"];
          },
        ];
      };
      progress_records: {
        Row: {
          completed_at: string | null;
          course_id: string;
          course_version_id: string | null;
          created_at: string;
          enrollment_id: string;
          id: string;
          lesson_id: string | null;
          lesson_version_id: string | null;
          organization_id: string;
          overridden_by: string | null;
          override_reason: string | null;
          started_at: string;
          status: string;
          subject_type: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          course_id: string;
          course_version_id?: string | null;
          created_at?: string;
          enrollment_id: string;
          id?: string;
          lesson_id?: string | null;
          lesson_version_id?: string | null;
          organization_id: string;
          overridden_by?: string | null;
          override_reason?: string | null;
          started_at?: string;
          status: string;
          subject_type: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          course_id?: string;
          course_version_id?: string | null;
          created_at?: string;
          enrollment_id?: string;
          id?: string;
          lesson_id?: string | null;
          lesson_version_id?: string | null;
          organization_id?: string;
          overridden_by?: string | null;
          override_reason?: string | null;
          started_at?: string;
          status?: string;
          subject_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "progress_records_course_version_id_fkey";
            columns: ["course_version_id"];
            isOneToOne: false;
            referencedRelation: "course_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "progress_records_enrollment_id_organization_id_fkey";
            columns: ["enrollment_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "progress_records_lesson_version_id_fkey";
            columns: ["lesson_version_id"];
            isOneToOne: false;
            referencedRelation: "lesson_versions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: {
        Args: { p_organization_id: string };
        Returns: string;
      };
      change_organization_slug: {
        Args: { p_new_slug: string; p_organization_id: string };
        Returns: undefined;
      };
      create_enrollment: {
        Args: {
          p_membership_id: string;
          p_source?: string;
          p_target_id: string;
          p_target_type: string;
        };
        Returns: string;
      };
      get_member_emails: {
        Args: { p_organization_id: string };
        Returns: {
          email: string;
          membership_id: string;
        }[];
      };
      invite_member: {
        Args: { p_email: string; p_organization_id: string };
        Returns: string;
      };
      override_progress: {
        Args: {
          p_enrollment_id: string;
          p_lesson_id: string;
          p_reason: string;
          p_status: string;
        };
        Returns: undefined;
      };
      provision_organization: {
        Args: { p_name: string; p_owner_email: string; p_slug: string };
        Returns: string;
      };
      publish_course: { Args: { p_course_id: string }; Returns: string };
      publish_lesson: { Args: { p_lesson_id: string }; Returns: string };
      record_lesson_progress: {
        Args: {
          p_action: string;
          p_enrollment_id: string;
          p_lesson_id: string;
        };
        Returns: undefined;
      };
      set_enrollment_status: {
        Args: { p_enrollment_id: string; p_status: string };
        Returns: undefined;
      };
      set_membership_status: {
        Args: { p_membership_id: string; p_status: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
