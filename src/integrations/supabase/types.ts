export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievement_catalog: {
        Row: {
          active: boolean
          created_at: string
          description: string
          emoji: string
          key: string
          name: string
          rarity: string
          scope: string
          sort_order: number
          trigger_config: Json
          trigger_type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description: string
          emoji: string
          key: string
          name: string
          rarity?: string
          scope?: string
          sort_order?: number
          trigger_config?: Json
          trigger_type: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          emoji?: string
          key?: string
          name?: string
          rarity?: string
          scope?: string
          sort_order?: number
          trigger_config?: Json
          trigger_type?: string
        }
        Relationships: []
      }
      activity_feed: {
        Row: {
          created_at: string
          id: string
          payload: Json
          scope: string
          team_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          scope?: string
          team_id?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          scope?: string
          team_id?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_feed_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_feed_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_public_team_ranking"
            referencedColumns: ["team_id"]
          },
        ]
      }
      admin_activity: {
        Row: {
          action: string
          created_at: string
          detail: Json
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      admin_notes: {
        Row: {
          created_at: string
          created_by: string
          id: string
          note: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          note: string
          subject_id: string
          subject_type: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          note?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: number
          planting_latitude: number
          planting_location_name: string
          planting_longitude: number
          reward_budget_ore_per_tree: number
          team_share_ore_per_tree: number
          updated_at: string
        }
        Insert: {
          id?: number
          planting_latitude?: number
          planting_location_name?: string
          planting_longitude?: number
          reward_budget_ore_per_tree?: number
          team_share_ore_per_tree?: number
          updated_at?: string
        }
        Update: {
          id?: number
          planting_latitude?: number
          planting_location_name?: string
          planting_longitude?: number
          reward_budget_ore_per_tree?: number
          team_share_ore_per_tree?: number
          updated_at?: string
        }
        Relationships: []
      }
      avatar_catalog: {
        Row: {
          active: boolean
          color: string
          created_at: string
          emoji: string
          key: string
          name: string
          sort_order: number
          unlock_config: Json
          unlock_type: string
        }
        Insert: {
          active?: boolean
          color: string
          created_at?: string
          emoji: string
          key: string
          name: string
          sort_order?: number
          unlock_config?: Json
          unlock_type?: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          emoji?: string
          key?: string
          name?: string
          sort_order?: number
          unlock_config?: Json
          unlock_type?: string
        }
        Relationships: []
      }
      backup_runs: {
        Row: {
          created_at: string
          deleted: Json
          files: Json
          id: string
          note: string | null
          ok: boolean
          triggered_by: string
        }
        Insert: {
          created_at?: string
          deleted?: Json
          files?: Json
          id?: string
          note?: string | null
          ok?: boolean
          triggered_by?: string
        }
        Update: {
          created_at?: string
          deleted?: Json
          files?: Json
          id?: string
          note?: string | null
          ok?: boolean
          triggered_by?: string
        }
        Relationships: []
      }
      boost_catalog: {
        Row: {
          active: boolean
          created_at: string
          description: string
          effect_config: Json
          effect_type: string
          emoji: string
          key: string
          name: string
          trigger_config: Json
          trigger_type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          effect_config?: Json
          effect_type: string
          emoji?: string
          key: string
          name: string
          trigger_config?: Json
          trigger_type: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          effect_config?: Json
          effect_type?: string
          emoji?: string
          key?: string
          name?: string
          trigger_config?: Json
          trigger_type?: string
        }
        Relationships: []
      }
      cert_templates: {
        Row: {
          accent_color: string
          aktiv: boolean
          allows_greeting: boolean
          background_key: string
          bg_url: string | null
          body_text: string
          canvas: Json
          category: string
          company_user_id: string | null
          config: Json
          created_at: string
          falt: Json
          heading_text: string
          id: string
          is_default: boolean
          kort_url: string | null
          logo_url: string | null
          name: string | null
          namn: string
          org_id: string | null
          show_coordinates: boolean
          show_social: boolean
          slug: string
          social_handles: string
          sort: number
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string
          aktiv?: boolean
          allows_greeting?: boolean
          background_key?: string
          bg_url?: string | null
          body_text?: string
          canvas?: Json
          category?: string
          company_user_id?: string | null
          config?: Json
          created_at?: string
          falt?: Json
          heading_text?: string
          id?: string
          is_default?: boolean
          kort_url?: string | null
          logo_url?: string | null
          name?: string | null
          namn: string
          org_id?: string | null
          show_coordinates?: boolean
          show_social?: boolean
          slug: string
          social_handles?: string
          sort?: number
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string
          aktiv?: boolean
          allows_greeting?: boolean
          background_key?: string
          bg_url?: string | null
          body_text?: string
          canvas?: Json
          category?: string
          company_user_id?: string | null
          config?: Json
          created_at?: string
          falt?: Json
          heading_text?: string
          id?: string
          is_default?: boolean
          kort_url?: string | null
          logo_url?: string | null
          name?: string | null
          namn?: string
          org_id?: string | null
          show_coordinates?: boolean
          show_social?: boolean
          slug?: string
          social_handles?: string
          sort?: number
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cert_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          created_at: string
          customer_id: string | null
          greeting: string | null
          id: string
          issued_date: string
          latitude: number
          location_name: string
          longitude: number
          purchase_id: string
          recipient_name: string
          template_id: string | null
          template_snapshot: Json
          tree_count: number
          user_id: string | null
          verification_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          greeting?: string | null
          id?: string
          issued_date?: string
          latitude: number
          location_name: string
          longitude: number
          purchase_id: string
          recipient_name: string
          template_id?: string | null
          template_snapshot: Json
          tree_count: number
          user_id?: string | null
          verification_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          greeting?: string | null
          id?: string
          issued_date?: string
          latitude?: number
          location_name?: string
          longitude?: number
          purchase_id?: string
          recipient_name?: string
          template_id?: string | null
          template_snapshot?: Json
          tree_count?: number
          user_id?: string | null
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cert_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      club_wallets: {
        Row: {
          lov: number
          updated_at: string
          user_id: string
        }
        Insert: {
          lov?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          lov?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      competitions: {
        Row: {
          active: boolean
          created_at: string
          description: string
          end_date: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          account_user_id: string | null
          created_at: string
          email: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          account_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          account_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      deal_claims: {
        Row: {
          code_issued: string
          created_at: string
          deal_id: string
          id: string
          lov_cost: number
          user_id: string
        }
        Insert: {
          code_issued: string
          created_at?: string
          deal_id: string
          id?: string
          lov_cost: number
          user_id: string
        }
        Update: {
          code_issued?: string
          created_at?: string
          deal_id?: string
          id?: string
          lov_cost?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_claims_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "partner_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppression: {
        Row: {
          created_at: string
          email: string
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          reason?: string
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string
        }
        Relationships: []
      }
      greeting_blocklist: {
        Row: {
          created_at: string
          id: string
          word: string
        }
        Insert: {
          created_at?: string
          id?: string
          word: string
        }
        Update: {
          created_at?: string
          id?: string
          word?: string
        }
        Relationships: []
      }
      greeting_themes: {
        Row: {
          active: boolean
          category: string
          config: Json
          created_at: string
          id: string
          is_default: boolean
          name: string
          slug: string
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          slug: string
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          slug?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      lov_transactions: {
        Row: {
          created_at: string
          delta: number
          id: string
          reason: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          reason: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          reason?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      newsletters: {
        Row: {
          audience_kind: string
          audience_value: string | null
          body: string | null
          cta_label: string | null
          cta_url: string | null
          headline: string | null
          id: string
          recipient_count: number
          sent_at: string
          sent_by: string | null
          subject: string
        }
        Insert: {
          audience_kind: string
          audience_value?: string | null
          body?: string | null
          cta_label?: string | null
          cta_url?: string | null
          headline?: string | null
          id?: string
          recipient_count?: number
          sent_at?: string
          sent_by?: string | null
          subject: string
        }
        Update: {
          audience_kind?: string
          audience_value?: string | null
          body?: string | null
          cta_label?: string | null
          cta_url?: string | null
          headline?: string | null
          id?: string
          recipient_count?: number
          sent_at?: string
          sent_by?: string | null
          subject?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      partner_deals: {
        Row: {
          active: boolean
          code_data: Json
          code_type: string
          created_at: string
          description: string
          id: string
          lov_cost: number
          partner_name: string
          sort: number
          stock: number | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code_data?: Json
          code_type?: string
          created_at?: string
          description?: string
          id?: string
          lov_cost: number
          partner_name: string
          sort?: number
          stock?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code_data?: Json
          code_type?: string
          created_at?: string
          description?: string
          id?: string
          lov_cost?: number
          partner_name?: string
          sort?: number
          stock?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      payout_requests: {
        Row: {
          amount_ore: number
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          note: string | null
          recipient: Json
          requested_by: string
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          amount_ore: number
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          note?: string | null
          recipient?: Json
          requested_by: string
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          amount_ore?: number
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          note?: string | null
          recipient?: Json
          requested_by?: string
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_public_team_ranking"
            referencedColumns: ["team_id"]
          },
        ]
      }
      photo_reports: {
        Row: {
          created_at: string
          id: string
          photo_path: string | null
          reason: string
          reported_by_user_id: string
          reported_user_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_path?: string | null
          reason: string
          reported_by_user_id: string
          reported_user_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_path?: string | null
          reason?: string
          reported_by_user_id?: string
          reported_user_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      point_events: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          end_at: string
          id: string
          multiplier: number
          name: string
          start_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          end_at: string
          id?: string
          multiplier?: number
          name: string
          start_at: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          end_at?: string
          id?: string
          multiplier?: number
          name?: string
          start_at?: string
        }
        Relationships: []
      }
      point_transactions: {
        Row: {
          created_at: string
          delta: number
          description: string | null
          id: string
          metadata: Json
          reference_id: string | null
          seller_user_id: string
          type: string
        }
        Insert: {
          created_at?: string
          delta: number
          description?: string | null
          id?: string
          metadata?: Json
          reference_id?: string | null
          seller_user_id: string
          type: string
        }
        Update: {
          created_at?: string
          delta?: number
          description?: string | null
          id?: string
          metadata?: Json
          reference_id?: string | null
          seller_user_id?: string
          type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: string
          avatar_key: string
          company_template_id: string | null
          created_at: string
          disabled_at: string | null
          email: string
          guardian_email: string | null
          id: string
          is_minor: boolean
          name: string
          photo_path: string | null
          user_id: string
        }
        Insert: {
          account_type?: string
          avatar_key?: string
          company_template_id?: string | null
          created_at?: string
          disabled_at?: string | null
          email: string
          guardian_email?: string | null
          id?: string
          is_minor?: boolean
          name: string
          photo_path?: string | null
          user_id: string
        }
        Update: {
          account_type?: string
          avatar_key?: string
          company_template_id?: string | null
          created_at?: string
          disabled_at?: string | null
          email?: string
          guardian_email?: string | null
          id?: string
          is_minor?: boolean
          name?: string
          photo_path?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_template_id_fkey"
            columns: ["company_template_id"]
            isOneToOne: false
            referencedRelation: "cert_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_updates: {
        Row: {
          audience_kind: string
          audience_value: string | null
          body: string
          created_at: string
          cta_label: string | null
          cta_url: string | null
          headline: string
          id: string
          image_url: string | null
          recipient_count: number
          sent_at: string
          sent_by: string | null
          subject: string
        }
        Insert: {
          audience_kind: string
          audience_value?: string | null
          body: string
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          headline: string
          id?: string
          image_url?: string | null
          recipient_count?: number
          sent_at?: string
          sent_by?: string | null
          subject: string
        }
        Update: {
          audience_kind?: string
          audience_value?: string | null
          body?: string
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          headline?: string
          id?: string
          image_url?: string | null
          recipient_count?: number
          sent_at?: string
          sent_by?: string | null
          subject?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          certificate_template_id: string | null
          created_at: string
          customer_id: string | null
          greeting: string | null
          id: string
          paid_at: string | null
          recipient_email: string | null
          recipient_name: string | null
          registered_by_user_id: string | null
          source: string | null
          source_order_ref: string | null
          source_seller: string | null
          status: string
          team_id: string | null
          team_share_ore: number
          theme_id: string | null
          total_amount_ore: number
          tree_count: number
          unit_price_ore: number
          user_id: string | null
        }
        Insert: {
          certificate_template_id?: string | null
          created_at?: string
          customer_id?: string | null
          greeting?: string | null
          id?: string
          paid_at?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          registered_by_user_id?: string | null
          source?: string | null
          source_order_ref?: string | null
          source_seller?: string | null
          status?: string
          team_id?: string | null
          team_share_ore?: number
          theme_id?: string | null
          total_amount_ore: number
          tree_count: number
          unit_price_ore: number
          user_id?: string | null
        }
        Update: {
          certificate_template_id?: string | null
          created_at?: string
          customer_id?: string | null
          greeting?: string | null
          id?: string
          paid_at?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          registered_by_user_id?: string | null
          source?: string | null
          source_order_ref?: string | null
          source_seller?: string | null
          status?: string
          team_id?: string | null
          team_share_ore?: number
          theme_id?: string | null
          total_amount_ore?: number
          tree_count?: number
          unit_price_ore?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_certificate_template_id_fkey"
            columns: ["certificate_template_id"]
            isOneToOne: false
            referencedRelation: "cert_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_public_team_ranking"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "purchases_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "greeting_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      push_log: {
        Row: {
          created_at: string
          failed: number
          id: string
          kind: string
          ok: number
          payload: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          failed?: number
          id?: string
          kind: string
          ok?: number
          payload?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          failed?: number
          id?: string
          kind?: string
          ok?: number
          payload?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      reward_orders: {
        Row: {
          cost_points: number
          delivered_at: string | null
          delivered_by: string | null
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          packed_at: string | null
          packed_by: string | null
          requested_at: string
          reward_id: string
          seller_user_id: string
          shipped_at: string | null
          shipped_by: string | null
          status: string
          team_id: string | null
        }
        Insert: {
          cost_points: number
          delivered_at?: string | null
          delivered_by?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          packed_at?: string | null
          packed_by?: string | null
          requested_at?: string
          reward_id: string
          seller_user_id: string
          shipped_at?: string | null
          shipped_by?: string | null
          status?: string
          team_id?: string | null
        }
        Update: {
          cost_points?: number
          delivered_at?: string | null
          delivered_by?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          packed_at?: string | null
          packed_by?: string | null
          requested_at?: string
          reward_id?: string
          seller_user_id?: string
          shipped_at?: string | null
          shipped_by?: string | null
          status?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reward_orders_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_orders_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_orders_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_public_team_ranking"
            referencedColumns: ["team_id"]
          },
        ]
      }
      rewards: {
        Row: {
          active: boolean
          category: string
          cost_ore: number
          cost_points: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          is_digital: boolean
          name: string
          sort_order: number
          stock: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          cost_ore?: number
          cost_points: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_digital?: boolean
          name: string
          sort_order?: number
          stock?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          cost_ore?: number
          cost_points?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_digital?: boolean
          name?: string
          sort_order?: number
          stock?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      seller_achievements: {
        Row: {
          achievement_key: string
          earned_at: string
          meta: Json
          user_id: string
        }
        Insert: {
          achievement_key: string
          earned_at?: string
          meta?: Json
          user_id: string
        }
        Update: {
          achievement_key?: string
          earned_at?: string
          meta?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_achievements_achievement_key_fkey"
            columns: ["achievement_key"]
            isOneToOne: false
            referencedRelation: "achievement_catalog"
            referencedColumns: ["key"]
          },
        ]
      }
      seller_boosts: {
        Row: {
          activated_at: string | null
          boost_key: string
          consumed_at: string | null
          dedupe_key: string | null
          earned_at: string
          id: string
          meta: Json
          remaining_uses: number
          status: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          boost_key: string
          consumed_at?: string | null
          dedupe_key?: string | null
          earned_at?: string
          id?: string
          meta?: Json
          remaining_uses?: number
          status?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          boost_key?: string
          consumed_at?: string | null
          dedupe_key?: string | null
          earned_at?: string
          id?: string
          meta?: Json
          remaining_uses?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_boosts_boost_key_fkey"
            columns: ["boost_key"]
            isOneToOne: false
            referencedRelation: "boost_catalog"
            referencedColumns: ["key"]
          },
        ]
      }
      seller_streaks: {
        Row: {
          best_weeks: number
          current_weeks: number
          freezes: number
          last_counted_week: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          best_weeks?: number
          current_weeks?: number
          freezes?: number
          last_counted_week?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          best_weeks?: number
          current_weeks?: number
          freezes?: number
          last_counted_week?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_events: {
        Row: {
          created_at: string
          event: string
          id: string
          meta: Json
          path: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          meta?: Json
          path?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          meta?: Json
          path?: string | null
        }
        Relationships: []
      }
      team_join_attempts: {
        Row: {
          attempted_at: string
          code: string
          id: string
          success: boolean
          user_id: string
        }
        Insert: {
          attempted_at?: string
          code: string
          id?: string
          success?: boolean
          user_id: string
        }
        Update: {
          attempted_at?: string
          code?: string
          id?: string
          success?: boolean
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_public_team_ranking"
            referencedColumns: ["team_id"]
          },
        ]
      }
      team_week_bonus: {
        Row: {
          awarded_at: string
          id: string
          iso_week: string
          team_id: string
        }
        Insert: {
          awarded_at?: string
          id?: string
          iso_week: string
          team_id: string
        }
        Update: {
          awarded_at?: string
          id?: string
          iso_week?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_week_bonus_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_week_bonus_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_public_team_ranking"
            referencedColumns: ["team_id"]
          },
        ]
      }
      teams: {
        Row: {
          cert_template_id: string | null
          city: string | null
          created_at: string
          created_by_user_id: string | null
          goal_end_date: string | null
          goal_trees: number | null
          id: string
          join_code: string | null
          name: string
          organization_id: string
          project_location: string | null
          show_team_name_on_certificate: boolean
          team_bonus_points: number
          updated_at: string
          weekly_goal_trees: number
        }
        Insert: {
          cert_template_id?: string | null
          city?: string | null
          created_at?: string
          created_by_user_id?: string | null
          goal_end_date?: string | null
          goal_trees?: number | null
          id?: string
          join_code?: string | null
          name: string
          organization_id: string
          project_location?: string | null
          show_team_name_on_certificate?: boolean
          team_bonus_points?: number
          updated_at?: string
          weekly_goal_trees?: number
        }
        Update: {
          cert_template_id?: string | null
          city?: string | null
          created_at?: string
          created_by_user_id?: string | null
          goal_end_date?: string | null
          goal_trees?: number | null
          id?: string
          join_code?: string | null
          name?: string
          organization_id?: string
          project_location?: string | null
          show_team_name_on_certificate?: boolean
          team_bonus_points?: number
          updated_at?: string
          weekly_goal_trees?: number
        }
        Relationships: [
          {
            foreignKeyName: "teams_cert_template_id_fkey"
            columns: ["cert_template_id"]
            isOneToOne: false
            referencedRelation: "cert_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      welcome_emails_sent: {
        Row: {
          kind: string
          sent_at: string
          sent_to: string
          team_id: string
          user_id: string
        }
        Insert: {
          kind: string
          sent_at?: string
          sent_to: string
          team_id: string
          user_id: string
        }
        Update: {
          kind?: string
          sent_at?: string
          sent_to?: string
          team_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_greetings_view: {
        Row: {
          certificate_greeting: string | null
          certificate_id: string | null
          certificate_template_id: string | null
          purchase_created_at: string | null
          purchase_greeting: string | null
          purchase_id: string | null
          recipient_email: string | null
          recipient_name: string | null
          template_name: string | null
          tree_count: number | null
          user_id: string | null
          verification_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_certificate_template_id_fkey"
            columns: ["certificate_template_id"]
            isOneToOne: false
            referencedRelation: "cert_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_daily_trees: {
        Row: {
          day: string | null
          revenue_ore: number | null
          source: string | null
          trees: number | null
        }
        Relationships: []
      }
      register_kunder: {
        Row: {
          antal_kop: number | null
          forsta_kop: string | null
          kallor: string[] | null
          kund_nyckel: string | null
          mottagar_epost: string | null
          mottagar_namn: string | null
          senaste_kop: string | null
          totalt_antal_trad: number | null
        }
        Relationships: []
      }
      register_rader: {
        Row: {
          antal_trad: number | null
          belopp_ore: number | null
          datum: string | null
          kalla: string | null
          mottagar_epost: string | null
          mottagar_namn: string | null
          projekt: string | null
          purchase_id: string | null
          source_seller: string | null
          status: string | null
          verification_id: string | null
        }
        Relationships: []
      }
      stats_trad_per_kalla: {
        Row: {
          antal_kop: number | null
          antal_trad: number | null
          kalla: string | null
        }
        Relationships: []
      }
      stats_trad_per_manad: {
        Row: {
          antal_kop: number | null
          antal_trad: number | null
          manad: string | null
        }
        Relationships: []
      }
      stats_trad_per_projekt: {
        Row: {
          antal_bevis: number | null
          antal_trad: number | null
          projekt: string | null
        }
        Relationships: []
      }
      stats_trad_per_saljare: {
        Row: {
          antal_kop: number | null
          antal_trad: number | null
          saljare: string | null
        }
        Relationships: []
      }
      v_public_seller_profile: {
        Row: {
          avatar_key: string | null
          first_name: string | null
          organization_name: string | null
          photo_path: string | null
          points_total: number | null
          points_week: number | null
          team_city: string | null
          team_id: string | null
          team_name: string | null
          trees_total: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_public_team_ranking"
            referencedColumns: ["team_id"]
          },
        ]
      }
      v_public_team_ranking: {
        Row: {
          city: string | null
          members: number | null
          organization_name: string | null
          points_total: number | null
          points_week: number | null
          team_id: string | null
          team_name: string | null
          trees_total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _assert_admin: { Args: never; Returns: undefined }
      _user_team_id: { Args: { _uid: string }; Returns: string }
      activate_seller_boost: {
        Args: { _boost_id: string }
        Returns: {
          activated_at: string | null
          boost_key: string
          consumed_at: string | null
          dedupe_key: string | null
          earned_at: string
          id: string
          meta: Json
          remaining_uses: number
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "seller_boosts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_insights_channel_mix_30d: { Args: never; Returns: Json }
      admin_insights_kpis: { Args: never; Returns: Json }
      admin_insights_recipients: { Args: never; Returns: Json }
      admin_insights_risk_queues: { Args: never; Returns: Json }
      admin_insights_sales_engine: { Args: never; Returns: Json }
      admin_insights_top_teams_week: { Args: never; Returns: Json }
      admin_insights_treebank: { Args: never; Returns: Json }
      admin_insights_weekly_series: { Args: never; Returns: Json }
      admin_replace_greeting: {
        Args: { _certificate_id: string; _new_greeting: string }
        Returns: {
          created_at: string
          customer_id: string | null
          greeting: string | null
          id: string
          issued_date: string
          latitude: number
          location_name: string
          longitude: number
          purchase_id: string
          recipient_name: string
          template_id: string | null
          template_snapshot: Json
          tree_count: number
          user_id: string | null
          verification_id: string
        }
        SetofOptions: {
          from: "*"
          to: "certificates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      award_achievement: {
        Args: { _key: string; _meta?: Json; _user_id: string }
        Returns: boolean
      }
      award_lov: {
        Args: {
          _delta: number
          _reason: string
          _ref_id: string
          _user_id: string
        }
        Returns: boolean
      }
      award_seller_boost: {
        Args: {
          _dedupe: string
          _key: string
          _meta: Json
          _user_id: string
          _uses: number
        }
        Returns: string
      }
      claim_deal: {
        Args: { _deal_id: string }
        Returns: {
          code_issued: string
          created_at: string
          deal_id: string
          id: string
          lov_cost: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "deal_claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_team_self_service: {
        Args: {
          _certificate_template_id: string
          _city: string
          _goal_end_date: string
          _goal_trees: number
          _new_organization_name: string
          _new_organization_type: string
          _organization_id: string
          _project_location: string
          _show_team_name: boolean
          _team_name: string
          _weekly_goal_trees: number
        }
        Returns: Json
      }
      generate_certificate: {
        Args: { _purchase_id: string }
        Returns: {
          id: string
          verification_id: string
        }[]
      }
      get_certificate_public: {
        Args: { p_verification_id: string }
        Returns: {
          greeting: string
          issued_date: string
          latitude: number
          location_name: string
          longitude: number
          recipient_name: string
          template_snapshot: Json
          theme_slug: string
          tree_count: number
          verification_id: string
        }[]
      }
      get_internal_secret: { Args: { _name: string }; Returns: string }
      get_my_club: { Args: never; Returns: Json }
      get_national_activity_feed: {
        Args: { _limit?: number }
        Returns: {
          avatar_key: string
          created_at: string
          first_name: string
          id: string
          payload: Json
          photo_path: string
          team_id: string
          team_name: string
          type: string
          user_id: string
        }[]
      }
      get_team_activity_feed: {
        Args: { _limit?: number }
        Returns: {
          avatar_key: string
          created_at: string
          first_name: string
          id: string
          payload: Json
          photo_path: string
          team_id: string
          type: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_leader: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      join_team_by_code: { Args: { _code: string }; Returns: Json }
      leader_reset_member_photo: {
        Args: { _user_id: string }
        Returns: undefined
      }
      log_admin_activity: {
        Args: { _action: string; _detail?: Json }
        Returns: string
      }
      lookup_team_by_code: { Args: { _code: string }; Returns: Json }
      process_seller_weekly_streaks: { Args: never; Returns: undefined }
      process_weekly_achievements: { Args: never; Returns: undefined }
      purchase_reward: {
        Args: { _reward_id: string }
        Returns: {
          cost_points: number
          delivered_at: string | null
          delivered_by: string | null
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          packed_at: string | null
          packed_by: string | null
          requested_at: string
          reward_id: string
          seller_user_id: string
          shipped_at: string | null
          shipped_by: string | null
          status: string
          team_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "reward_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refresh_insights_daily_trees: { Args: never; Returns: undefined }
      seller_points_balance: { Args: { _user_id: string }; Returns: number }
      update_team_self_service: {
        Args: {
          _certificate_template_id: string
          _city: string
          _goal_end_date: string
          _goal_trees: number
          _project_location: string
          _show_team_name: boolean
          _team_id: string
          _team_name: string
          _weekly_goal_trees: number
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user" | "seller" | "team_leader"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "seller", "team_leader"],
    },
  },
} as const
