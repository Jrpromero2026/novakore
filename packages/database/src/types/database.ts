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
      get_member_emails: {
        Args: { p_organization_id: string };
        Returns: {
          membership_id: string;
          email: string;
        }[];
      };
      invite_member: {
        Args: { p_email: string; p_organization_id: string };
        Returns: string;
      };
      provision_organization: {
        Args: { p_name: string; p_owner_email: string; p_slug: string };
        Returns: string;
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
