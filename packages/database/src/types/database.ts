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
      ai_budgets: {
        Row: {
          monthly_limit_cents: number;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          monthly_limit_cents?: number;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          monthly_limit_cents?: number;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_budgets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_generations: {
        Row: {
          actual_cents: number | null;
          audience: string | null;
          completed_at: string | null;
          created_at: string;
          error: string | null;
          id: string;
          input_tokens: number | null;
          model_profile: string;
          month_key: string;
          objective: string;
          operation: string;
          organization_id: string;
          output: Json | null;
          output_tokens: number | null;
          prompt_version: number;
          provider: string;
          provider_model: string | null;
          reading_level: string | null;
          requested_by: string;
          reserved_cents: number;
          source_document_ids: string[];
          status: string;
        };
        Insert: {
          actual_cents?: number | null;
          audience?: string | null;
          completed_at?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          input_tokens?: number | null;
          model_profile: string;
          month_key: string;
          objective: string;
          operation: string;
          organization_id: string;
          output?: Json | null;
          output_tokens?: number | null;
          prompt_version?: number;
          provider: string;
          provider_model?: string | null;
          reading_level?: string | null;
          requested_by: string;
          reserved_cents: number;
          source_document_ids?: string[];
          status?: string;
        };
        Update: {
          actual_cents?: number | null;
          audience?: string | null;
          completed_at?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          input_tokens?: number | null;
          model_profile?: string;
          month_key?: string;
          objective?: string;
          operation?: string;
          organization_id?: string;
          output?: Json | null;
          output_tokens?: number | null;
          prompt_version?: number;
          provider?: string;
          provider_model?: string | null;
          reading_level?: string | null;
          requested_by?: string;
          reserved_cents?: number;
          source_document_ids?: string[];
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_generations_organization_id_fkey";
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
      assessment_assignments: {
        Row: {
          assessment_id: string;
          assessment_version_id: string;
          available_from: string | null;
          available_until: string | null;
          completion_effect: string;
          course_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          lesson_id: string;
          organization_id: string;
          position: string;
          required: boolean;
          status: string;
          updated_at: string;
        };
        Insert: {
          assessment_id: string;
          assessment_version_id: string;
          available_from?: string | null;
          available_until?: string | null;
          completion_effect?: string;
          course_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          lesson_id: string;
          organization_id: string;
          position?: string;
          required?: boolean;
          status?: string;
          updated_at?: string;
        };
        Update: {
          assessment_id?: string;
          assessment_version_id?: string;
          available_from?: string | null;
          available_until?: string | null;
          completion_effect?: string;
          course_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          lesson_id?: string;
          organization_id?: string;
          position?: string;
          required?: boolean;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_assignments_assessment_id_organization_id_fkey";
            columns: ["assessment_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "assessments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "assessment_assignments_assessment_version_id_fkey";
            columns: ["assessment_version_id"];
            isOneToOne: false;
            referencedRelation: "assessment_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_assignments_course_id_organization_id_fkey";
            columns: ["course_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "assessment_assignments_lesson_id_organization_id_fkey";
            columns: ["lesson_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      assessment_attempts: {
        Row: {
          assessment_id: string;
          assessment_version_id: string;
          assignment_id: string;
          attempt_number: number;
          course_id: string;
          created_at: string;
          enrollment_id: string;
          expires_at: string | null;
          finalized_at: string | null;
          id: string;
          lesson_id: string;
          membership_id: string;
          organization_id: string;
          passing_percent: number;
          points_earned: number | null;
          points_possible: number | null;
          score_percent: number | null;
          started_at: string;
          status: string;
          submitted_at: string | null;
          time_limit_minutes: number | null;
          updated_at: string;
        };
        Insert: {
          assessment_id: string;
          assessment_version_id: string;
          assignment_id: string;
          attempt_number: number;
          course_id: string;
          created_at?: string;
          enrollment_id: string;
          expires_at?: string | null;
          finalized_at?: string | null;
          id?: string;
          lesson_id: string;
          membership_id: string;
          organization_id: string;
          passing_percent: number;
          points_earned?: number | null;
          points_possible?: number | null;
          score_percent?: number | null;
          started_at?: string;
          status?: string;
          submitted_at?: string | null;
          time_limit_minutes?: number | null;
          updated_at?: string;
        };
        Update: {
          assessment_id?: string;
          assessment_version_id?: string;
          assignment_id?: string;
          attempt_number?: number;
          course_id?: string;
          created_at?: string;
          enrollment_id?: string;
          expires_at?: string | null;
          finalized_at?: string | null;
          id?: string;
          lesson_id?: string;
          membership_id?: string;
          organization_id?: string;
          passing_percent?: number;
          points_earned?: number | null;
          points_possible?: number | null;
          score_percent?: number | null;
          started_at?: string;
          status?: string;
          submitted_at?: string | null;
          time_limit_minutes?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_attempts_assessment_version_id_fkey";
            columns: ["assessment_version_id"];
            isOneToOne: false;
            referencedRelation: "assessment_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assessment_attempts_assignment_id_organization_id_fkey";
            columns: ["assignment_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "assessment_assignments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "assessment_attempts_enrollment_id_organization_id_fkey";
            columns: ["enrollment_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "assessment_attempts_membership_id_organization_id_fkey";
            columns: ["membership_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      assessment_items: {
        Row: {
          assessment_id: string;
          created_at: string;
          data: Json;
          id: string;
          item_type: string;
          organization_id: string;
          position: string;
          required: boolean;
          schema_version: number;
          updated_at: string;
        };
        Insert: {
          assessment_id: string;
          created_at?: string;
          data: Json;
          id?: string;
          item_type: string;
          organization_id: string;
          position: string;
          required?: boolean;
          schema_version: number;
          updated_at?: string;
        };
        Update: {
          assessment_id?: string;
          created_at?: string;
          data?: Json;
          id?: string;
          item_type?: string;
          organization_id?: string;
          position?: string;
          required?: boolean;
          schema_version?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_items_assessment_id_organization_id_fkey";
            columns: ["assessment_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "assessments";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      assessment_responses: {
        Row: {
          attempt_id: string;
          correct: boolean | null;
          created_at: string;
          id: string;
          item_id: string;
          item_type: string;
          needs_review: boolean;
          organization_id: string;
          points_earned: number | null;
          points_possible: number | null;
          response: Json;
          reviewed_points: number | null;
          reviewer_feedback: string | null;
          updated_at: string;
        };
        Insert: {
          attempt_id: string;
          correct?: boolean | null;
          created_at?: string;
          id?: string;
          item_id: string;
          item_type: string;
          needs_review?: boolean;
          organization_id: string;
          points_earned?: number | null;
          points_possible?: number | null;
          response: Json;
          reviewed_points?: number | null;
          reviewer_feedback?: string | null;
          updated_at?: string;
        };
        Update: {
          attempt_id?: string;
          correct?: boolean | null;
          created_at?: string;
          id?: string;
          item_id?: string;
          item_type?: string;
          needs_review?: boolean;
          organization_id?: string;
          points_earned?: number | null;
          points_possible?: number | null;
          response?: Json;
          reviewed_points?: number | null;
          reviewer_feedback?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_responses_attempt_id_organization_id_fkey";
            columns: ["attempt_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "assessment_attempts";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      assessment_reviews: {
        Row: {
          attempt_id: string;
          claimed_at: string | null;
          completed_at: string | null;
          created_at: string;
          decision: string | null;
          id: string;
          organization_id: string;
          overall_feedback: string | null;
          reviewer_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_id: string;
          claimed_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          decision?: string | null;
          id?: string;
          organization_id: string;
          overall_feedback?: string | null;
          reviewer_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt_id?: string;
          claimed_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          decision?: string | null;
          id?: string;
          organization_id?: string;
          overall_feedback?: string | null;
          reviewer_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_reviews_attempt_id_organization_id_fkey";
            columns: ["attempt_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "assessment_attempts";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      assessment_submission_files: {
        Row: {
          attempt_id: string;
          byte_size: number;
          created_at: string;
          file_name: string;
          id: string;
          item_id: string;
          membership_id: string;
          mime_type: string;
          organization_id: string;
          response_id: string | null;
          status: string;
          storage_path: string;
          updated_at: string;
        };
        Insert: {
          attempt_id: string;
          byte_size: number;
          created_at?: string;
          file_name: string;
          id?: string;
          item_id: string;
          membership_id: string;
          mime_type: string;
          organization_id: string;
          response_id?: string | null;
          status?: string;
          storage_path: string;
          updated_at?: string;
        };
        Update: {
          attempt_id?: string;
          byte_size?: number;
          created_at?: string;
          file_name?: string;
          id?: string;
          item_id?: string;
          membership_id?: string;
          mime_type?: string;
          organization_id?: string;
          response_id?: string | null;
          status?: string;
          storage_path?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_submission_files_attempt_id_organization_id_fkey";
            columns: ["attempt_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "assessment_attempts";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "assessment_submission_files_membership_id_organization_id_fkey";
            columns: ["membership_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["id", "organization_id"];
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
      certificate_templates: {
        Row: {
          academy_id: string | null;
          archived_at: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          organization_id: string;
          schema_version: number;
          status: string;
          template: Json;
          updated_at: string;
        };
        Insert: {
          academy_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          schema_version?: number;
          status?: string;
          template: Json;
          updated_at?: string;
        };
        Update: {
          academy_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          schema_version?: number;
          status?: string;
          template?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "certificate_templates_academy_id_organization_id_fkey";
            columns: ["academy_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "academies";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "certificate_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      certificates: {
        Row: {
          assignment_id: string | null;
          course_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          learning_path_id: string | null;
          organization_id: string;
          source_type: string;
          status: string;
          template_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          assignment_id?: string | null;
          course_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          learning_path_id?: string | null;
          organization_id: string;
          source_type: string;
          status?: string;
          template_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          assignment_id?: string | null;
          course_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          learning_path_id?: string | null;
          organization_id?: string;
          source_type?: string;
          status?: string;
          template_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "certificates_assignment_id_organization_id_fkey";
            columns: ["assignment_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "assessment_assignments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "certificates_course_id_organization_id_fkey";
            columns: ["course_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "courses";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "certificates_learning_path_id_organization_id_fkey";
            columns: ["learning_path_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "learning_paths";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "certificates_template_id_organization_id_fkey";
            columns: ["template_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "certificate_templates";
            referencedColumns: ["id", "organization_id"];
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
          source_reusable_block_id: string | null;
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
          source_reusable_block_id?: string | null;
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
          source_reusable_block_id?: string | null;
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
          {
            foreignKeyName: "content_blocks_source_reusable_fk";
            columns: ["source_reusable_block_id"];
            isOneToOne: false;
            referencedRelation: "reusable_blocks";
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
      feedback: {
        Row: {
          assignee_membership_id: string | null;
          category: string;
          context: Json;
          created_at: string;
          id: string;
          membership_id: string;
          message: string;
          notes: string | null;
          organization_id: string;
          resolution: string | null;
          severity: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          assignee_membership_id?: string | null;
          category: string;
          context?: Json;
          created_at?: string;
          id?: string;
          membership_id: string;
          message: string;
          notes?: string | null;
          organization_id: string;
          resolution?: string | null;
          severity?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          assignee_membership_id?: string | null;
          category?: string;
          context?: Json;
          created_at?: string;
          id?: string;
          membership_id?: string;
          message?: string;
          notes?: string | null;
          organization_id?: string;
          resolution?: string | null;
          severity?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_assignee_membership_id_fkey";
            columns: ["assignee_membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "feedback_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "feedback_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      issued_credentials: {
        Row: {
          attempt_id: string | null;
          certificate_id: string;
          course_version_id: string | null;
          created_at: string;
          enrollment_id: string | null;
          expires_at: string | null;
          id: string;
          issued_at: string;
          issued_by: string | null;
          membership_id: string;
          organization_id: string;
          recipient_name: string;
          revocation_reason: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          status: string;
          template_snapshot: Json;
          title: string;
          updated_at: string;
          verification_code: string;
        };
        Insert: {
          attempt_id?: string | null;
          certificate_id: string;
          course_version_id?: string | null;
          created_at?: string;
          enrollment_id?: string | null;
          expires_at?: string | null;
          id?: string;
          issued_at?: string;
          issued_by?: string | null;
          membership_id: string;
          organization_id: string;
          recipient_name: string;
          revocation_reason?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          template_snapshot: Json;
          title: string;
          updated_at?: string;
          verification_code: string;
        };
        Update: {
          attempt_id?: string | null;
          certificate_id?: string;
          course_version_id?: string | null;
          created_at?: string;
          enrollment_id?: string | null;
          expires_at?: string | null;
          id?: string;
          issued_at?: string;
          issued_by?: string | null;
          membership_id?: string;
          organization_id?: string;
          recipient_name?: string;
          revocation_reason?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          status?: string;
          template_snapshot?: Json;
          title?: string;
          updated_at?: string;
          verification_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: "issued_credentials_attempt_id_organization_id_fkey";
            columns: ["attempt_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "assessment_attempts";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "issued_credentials_certificate_id_organization_id_fkey";
            columns: ["certificate_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "certificates";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "issued_credentials_course_version_id_fkey";
            columns: ["course_version_id"];
            isOneToOne: false;
            referencedRelation: "course_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "issued_credentials_enrollment_id_organization_id_fkey";
            columns: ["enrollment_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "issued_credentials_membership_id_organization_id_fkey";
            columns: ["membership_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      learning_paths: {
        Row: {
          academy_id: string;
          allow_self_enrollment: boolean;
          archived_at: string | null;
          audience_key: string | null;
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
          audience_key?: string | null;
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
          audience_key?: string | null;
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
      onboarding_events: {
        Row: {
          data: Json;
          event_type: string;
          id: string;
          membership_id: string;
          occurred_at: string;
          organization_id: string;
          step_id: string | null;
          walkthrough_id: string | null;
        };
        Insert: {
          data?: Json;
          event_type: string;
          id?: string;
          membership_id: string;
          occurred_at?: string;
          organization_id: string;
          step_id?: string | null;
          walkthrough_id?: string | null;
        };
        Update: {
          data?: Json;
          event_type?: string;
          id?: string;
          membership_id?: string;
          occurred_at?: string;
          organization_id?: string;
          step_id?: string | null;
          walkthrough_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "onboarding_events_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "onboarding_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
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
      organization_onboarding: {
        Row: {
          completed_celebrated_at: string | null;
          created_at: string;
          dismissed_at: string | null;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          completed_celebrated_at?: string | null;
          created_at?: string;
          dismissed_at?: string | null;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          completed_celebrated_at?: string | null;
          created_at?: string;
          dismissed_at?: string | null;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organization_onboarding_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
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
      path_layouts: {
        Row: {
          layout: Json;
          organization_id: string;
          path_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          layout: Json;
          organization_id: string;
          path_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          layout?: Json;
          organization_id?: string;
          path_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "path_layouts_path_id_organization_id_fkey";
            columns: ["path_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "learning_paths";
            referencedColumns: ["id", "organization_id"];
          },
        ];
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
      reusable_blocks: {
        Row: {
          academy_id: string | null;
          archived_at: string | null;
          block_type: string;
          created_at: string;
          created_by: string | null;
          data: Json;
          description: string | null;
          id: string;
          organization_id: string;
          schema_version: number;
          status: string;
          tags: string[];
          title: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          academy_id?: string | null;
          archived_at?: string | null;
          block_type: string;
          created_at?: string;
          created_by?: string | null;
          data: Json;
          description?: string | null;
          id?: string;
          organization_id: string;
          schema_version: number;
          status?: string;
          tags?: string[];
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          academy_id?: string | null;
          archived_at?: string | null;
          block_type?: string;
          created_at?: string;
          created_by?: string | null;
          data?: Json;
          description?: string | null;
          id?: string;
          organization_id?: string;
          schema_version?: number;
          status?: string;
          tags?: string[];
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "reusable_blocks_academy_id_organization_id_fkey";
            columns: ["academy_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "academies";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "reusable_blocks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      review_comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          organization_id: string;
          request_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          organization_id: string;
          request_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          request_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_comments_request_id_organization_id_fkey";
            columns: ["request_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "review_requests";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      review_requests: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          note: string | null;
          organization_id: string;
          requested_by: string;
          status: string;
          subject_id: string;
          subject_type: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          note?: string | null;
          organization_id: string;
          requested_by: string;
          status?: string;
          subject_id: string;
          subject_type: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          note?: string | null;
          organization_id?: string;
          requested_by?: string;
          status?: string;
          subject_id?: string;
          subject_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      source_documents: {
        Row: {
          archived_at: string | null;
          content: string | null;
          content_hash: string | null;
          created_at: string;
          created_by: string | null;
          extraction_status: string;
          id: string;
          kind: string;
          organization_id: string;
          provenance: string | null;
          review_state: string;
          status: string;
          storage_path: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          content?: string | null;
          content_hash?: string | null;
          created_at?: string;
          created_by?: string | null;
          extraction_status?: string;
          id?: string;
          kind: string;
          organization_id: string;
          provenance?: string | null;
          review_state?: string;
          status?: string;
          storage_path?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          content?: string | null;
          content_hash?: string | null;
          created_at?: string;
          created_by?: string | null;
          extraction_status?: string;
          id?: string;
          kind?: string;
          organization_id?: string;
          provenance?: string | null;
          review_state?: string;
          status?: string;
          storage_path?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_documents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      tester_labels: {
        Row: {
          created_at: string;
          id: string;
          label: string;
          membership_id: string;
          organization_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          label: string;
          membership_id: string;
          organization_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          label?: string;
          membership_id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tester_labels_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tester_labels_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_deliveries: {
        Row: {
          attempt_count: number;
          causation_id: string | null;
          correlation_id: string | null;
          created_at: string;
          delivered_at: string | null;
          endpoint_id: string;
          id: string;
          last_error: string | null;
          next_attempt_at: string;
          organization_id: string;
          outbox_event_id: string;
          response_excerpt: string | null;
          response_status: number | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          causation_id?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          endpoint_id: string;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          organization_id: string;
          outbox_event_id: string;
          response_excerpt?: string | null;
          response_status?: number | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          causation_id?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          endpoint_id?: string;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          organization_id?: string;
          outbox_event_id?: string;
          response_excerpt?: string | null;
          response_status?: number | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_organization_id_fkey";
            columns: ["endpoint_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "webhook_endpoints";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "webhook_deliveries_outbox_event_id_fkey";
            columns: ["outbox_event_id"];
            isOneToOne: false;
            referencedRelation: "outbox_events";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_endpoints: {
        Row: {
          created_at: string;
          created_by: string | null;
          event_types: string[];
          id: string;
          organization_id: string;
          secret: string;
          status: string;
          updated_at: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          event_types?: string[];
          id?: string;
          organization_id: string;
          secret: string;
          status?: string;
          updated_at?: string;
          url: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          event_types?: string[];
          id?: string;
          organization_id?: string;
          secret?: string;
          status?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
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
      assign_assessment: {
        Args: {
          p_assessment_id: string;
          p_completion_effect?: string;
          p_lesson_id: string;
          p_required?: boolean;
        };
        Returns: string;
      };
      bfh_enroll_or_assign_external: {
        Args: {
          p_api_key: string;
          p_due_at: string;
          p_external_user_id: string;
          p_idempotency_key: string;
          p_kind: string;
          p_target_slug: string;
          p_target_type: string;
        };
        Returns: Json;
      };
      bfh_exchange_handoff: {
        Args: {
          p_access_level: string;
          p_audiences: string[];
          p_display_name: string;
          p_email: string;
          p_expires_at: number;
          p_external_user_id: string;
          p_issued_at: number;
          p_nonce: string;
          p_organization_slug: string;
          p_signature: string;
        };
        Returns: Json;
      };
      bfh_set_external_identity_status: {
        Args: {
          p_external_user_id: string;
          p_organization_slug: string;
          p_status: string;
        };
        Returns: Json;
      };
      change_organization_slug: {
        Args: { p_new_slug: string; p_organization_id: string };
        Returns: undefined;
      };
      claim_assessment_review: {
        Args: { p_attempt_id: string };
        Returns: undefined;
      };
      complete_assessment_review: {
        Args: {
          p_attempt_id: string;
          p_item_feedback: Json;
          p_item_scores: Json;
          p_overall_feedback?: string;
        };
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
      decide_review: {
        Args: { p_decision: string; p_note?: string; p_request_id: string };
        Returns: undefined;
      };
      emit_studio_event: {
        Args: {
          p_context?: Json;
          p_data?: Json;
          p_organization_id: string;
          p_subject_id: string;
          p_subject_kind: string;
          p_type: string;
        };
        Returns: undefined;
      };
      get_assessment_attempt_payload: {
        Args: { p_attempt_id: string };
        Returns: Json;
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
      issue_credential: {
        Args: {
          p_certificate_id: string;
          p_membership_id: string;
          p_recipient_name?: string;
        };
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
      org_event_daily_by_type: {
        Args: { p_organization_id: string; p_window_days?: number };
        Returns: Json;
      };
      org_event_metrics: {
        Args: { p_cohort?: string; p_organization_id: string };
        Returns: Json;
      };
      provision_organization: {
        Args: { p_name: string; p_owner_email: string; p_slug: string };
        Returns: string;
      };
      publish_assessment: {
        Args: { p_assessment_id: string };
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
      register_submission_file: {
        Args: {
          p_attempt_id: string;
          p_byte_size: number;
          p_file_name: string;
          p_item_id: string;
          p_mime_type: string;
          p_storage_path: string;
        };
        Returns: string;
      };
      request_review: {
        Args: {
          p_note?: string;
          p_organization_id: string;
          p_subject_id: string;
          p_subject_type: string;
        };
        Returns: string;
      };
      reserve_ai_generation: {
        Args: {
          p_audience?: string;
          p_model_profile: string;
          p_objective: string;
          p_operation: string;
          p_organization_id: string;
          p_provider: string;
          p_reading_level?: string;
          p_source_document_ids?: string[];
        };
        Returns: string;
      };
      resolve_ai_generation: {
        Args: { p_accepted: boolean; p_generation_id: string };
        Returns: undefined;
      };
      retry_webhook_delivery: {
        Args: { p_delivery_id: string };
        Returns: undefined;
      };
      revoke_credential: {
        Args: { p_credential_id: string; p_reason: string };
        Returns: undefined;
      };
      save_assessment_response: {
        Args: { p_attempt_id: string; p_item_id: string; p_response: Json };
        Returns: undefined;
      };
      set_assessment_assignment_status: {
        Args: { p_assignment_id: string; p_status: string };
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
      set_organization_status: {
        Args: { p_organization_id: string; p_status: string };
        Returns: Json;
      };
      settle_ai_generation: {
        Args: {
          p_error?: string;
          p_generation_id: string;
          p_input_tokens?: number;
          p_output?: Json;
          p_output_tokens?: number;
          p_provider_model?: string;
          p_success: boolean;
        };
        Returns: undefined;
      };
      start_assessment_attempt: {
        Args: { p_assignment_id: string; p_enrollment_id: string };
        Returns: string;
      };
      submit_assessment_attempt: {
        Args: { p_attempt_id: string };
        Returns: undefined;
      };
      tenant_diagnostics: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
      verify_credential: { Args: { p_code: string }; Returns: Json };
      worker_claim_webhook_deliveries: {
        Args: { p_limit?: number };
        Returns: {
          attempt_count: number;
          causation_id: string | null;
          correlation_id: string | null;
          created_at: string;
          delivered_at: string | null;
          endpoint_id: string;
          id: string;
          last_error: string | null;
          next_attempt_at: string;
          organization_id: string;
          outbox_event_id: string;
          response_excerpt: string | null;
          response_status: number | null;
          status: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "webhook_deliveries";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      worker_settle_webhook_delivery: {
        Args: {
          p_backoff_seconds?: number;
          p_delivery_id: string;
          p_error?: string;
          p_outcome: string;
          p_response_excerpt?: string;
          p_response_status?: number;
        };
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
