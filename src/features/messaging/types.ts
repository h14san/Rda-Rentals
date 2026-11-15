/**
 * In-app chat. Mirrors supabase/migrations/20261116120000_chat.sql.
 *
 * Named "messaging" because src/features/listings/chat.ts is the AI assistant.
 */

export type MessageKind = 'text' | 'system';

export type ConversationRow = {
  id: string;
  /** Null once the listing has been deleted; listing_title still reads. */
  listing_id: string | null;
  listing_title: string;
  renter_id: string;
  landlord_id: string;
  created_at: string;
  last_message_at: string;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  /** Null for system messages. */
  sender_id: string | null;
  kind: MessageKind;
  /** Already masked by the server where masking applied. */
  body: string;
  masked: boolean;
  flagged: boolean;
  created_at: string;
};

export type ConversationParticipantRow = {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
  archived: boolean;
  muted: boolean;
};

export type UserBlockRow = {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
};

/** What staff_report_conversation() returns. */
export type StaffTranscript = {
  conversation: {
    id: string;
    listing_id: string | null;
    listing_title: string;
    renter: { id: string; full_name: string | null };
    landlord: { id: string; full_name: string | null };
  };
  messages: {
    id: string;
    sender_id: string | null;
    kind: MessageKind;
    body: string;
    /** What was typed, where masking changed it. Null otherwise. */
    original_body: string | null;
    flagged: boolean;
    /** The message the report is about, if it is about one. */
    reported: boolean;
    created_at: string;
  }[];
};

export const MAX_MESSAGE_LENGTH = 2000;

/** Shown under a bubble whose contact details the server replaced. */
export const MASKED_NOTICE = 'Contact details are hidden until a booking is confirmed.';
