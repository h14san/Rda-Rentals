/**
 * Safety and help content (Features #25, #49; Blueprint §39).
 *
 * Bundled, not fetched: this is what someone reads when a deal feels wrong,
 * and that is exactly when the connection is bad. Keep it short and plain.
 *
 * Every factual claim here describes how the app really behaves. If a rule
 * changes (masking, what staff can read, where data is stored), change the
 * words in the same commit. The privacy topic in particular is a statement to
 * users about their data, not marketing.
 */

/**
 * Where "contact support" goes. Unset until the owner has a monitored inbox;
 * the screens say so plainly rather than print an address nobody reads.
 */
export const SUPPORT_EMAIL: string | null =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || null;

export const HELP_TOPICS = ['badges', 'payments', 'contact-details', 'reporting', 'privacy'] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];

export function isHelpTopic(value: string | undefined): value is HelpTopic {
  return (HELP_TOPICS as readonly string[]).includes(value ?? '');
}

type Section = { heading: string; body: string[] };

export const HELP: Record<HelpTopic, { title: string; summary: string; sections: Section[] }> = {
  badges: {
    title: 'What the checks mean',
    summary: 'Each badge names one thing a person at Rwanda Rentals checked.',
    sections: [
      {
        heading: 'ID checked',
        body: [
          'We looked at a photo of the landlord\'s identity document and it matched the account.',
          'It does not mean they own the property, or that they are honest.',
        ],
      },
      {
        heading: 'Property checked',
        body: ['We confirmed that the property exists at the location the landlord gave us.'],
      },
      {
        heading: 'Authorized to list',
        body: ['The advertiser showed us they are allowed to rent this property out, as owner or agent.'],
      },
      {
        heading: 'Details reviewed',
        body: ['We compared the rent, terms and photos against the property.'],
      },
      {
        heading: 'What a badge is not',
        body: [
          'A badge lowers the risk. It is not a guarantee, and a listing with no badge for something has simply not had that checked.',
          'Always see the place yourself before you pay anything.',
        ],
      },
    ],
  },

  payments: {
    title: 'Paying safely',
    summary: 'Never pay before you have seen the place.',
    sections: [
      {
        heading: 'The one rule',
        body: [
          'Do not send money for a place you have not visited: no deposit, no "holding fee", no "viewing fee".',
          'Rwanda Rentals does not take payments in the app yet. Anyone who says a payment is "through Rwanda Rentals" is lying.',
        ],
      },
      {
        heading: 'Common MoMo scams',
        body: [
          '"Many people want it, send a deposit now to hold it." A real landlord can wait for a viewing.',
          '"I am out of the country, pay and my cousin will give you the key." There is no key.',
          '"I sent you money by mistake, please send it back." Check your own balance first, not the SMS.',
          'Being asked to dial a code starting with *182* that you do not understand. Dialling it can approve a payment from your account.',
        ],
      },
      {
        heading: 'When you do pay',
        body: [
          'Pay the person you met, at the property, after you have seen it and agreed the terms.',
          'Check that the name on the MoMo account matches the landlord you have been dealing with.',
          'Ask for a signed receipt or a written agreement, and keep a photo of it.',
        ],
      },
      {
        heading: 'If something feels wrong',
        body: ['Stop, and report the listing or the conversation. Reports are private.'],
      },
    ],
  },

  'contact-details': {
    title: 'Why contact details are hidden',
    summary: 'Phone numbers and emails in messages show as ••• until a booking is confirmed.',
    sections: [
      {
        heading: 'What is hidden',
        body: [
          'Phone numbers, email addresses and MoMo codes typed into a message are replaced with ••• before the message is delivered. The other person never receives them.',
          'This applies to both sides, landlords and renters.',
        ],
      },
      {
        heading: 'Why',
        body: [
          'Most rental scams start by moving the conversation somewhere nobody can see it. Keeping it here means there is a record, and a report can be acted on.',
          'It also keeps your number away from people you have only just started talking to.',
        ],
      },
      {
        heading: 'When it stops',
        body: [
          'Once a booking between you is confirmed, new messages are delivered as typed, and you can exchange numbers. The exact address is shared at the same moment.',
          'Messages sent before that stay as they were delivered.',
        ],
      },
    ],
  },

  reporting: {
    title: 'Reports and appeals',
    summary: 'How to report, what happens next, and what to do if we got it wrong.',
    sections: [
      {
        heading: 'How to report',
        body: [
          'Listing: "Report this listing" at the bottom of its page.',
          'Person: open their page from a listing and choose "Report this account".',
          'Conversation or message: the menu in the conversation, or press and hold a message.',
        ],
      },
      {
        heading: 'What happens next',
        body: [
          'A member of our team looks at it. The person you report is not told who reported them.',
          'You can follow the result under "Your reports" on your profile, and we notify you when it is decided.',
          'If the report is about a conversation, the reviewer can read that conversation while the report is open. Every such look is recorded.',
        ],
      },
      {
        heading: 'If your listing or account was suspended',
        body: [
          'The reason is shown on your profile. A suspended listing is hidden from everyone else; a suspended account cannot post or send messages, but you can still sign in.',
          'If you think the decision was wrong, contact support with your account name and what you want us to look at again.',
        ],
      },
    ],
  },

  privacy: {
    title: 'Your information',
    summary: 'What we collect, why, who can see it, and how to have it deleted.',
    sections: [
      {
        heading: 'What we collect',
        body: [
          'Your sign-in email or phone number, and the name you give.',
          'Listings you post: details, photos, and the exact location.',
          'If you verify as a landlord: photos of your identity document.',
          'Messages you send, rentals you save, and reports you make.',
          'A push token for your phone, if you turn notifications on.',
          'Not your location. If you let the map use it, it stays on your phone and is not saved. To find places, the app sends the area shown on the map, rounded to about a kilometre.',
        ],
      },
      {
        heading: 'Who can see what',
        body: [
          'Other users see your name, your live listings, and which checks you passed. They never see your phone number or email.',
          'A listing\'s exact address and map pin are private. Others see an approximate area until a booking with them is confirmed.',
          'Identity documents are seen only by our verification staff.',
          'Messages are seen by the two people in the conversation. Our staff can read a conversation only while a report about it is open.',
        ],
      },
      {
        heading: 'Where it is kept',
        body: [
          'On servers in the European Union (Frankfurt), run by our hosting provider.',
          'The search assistant and "Write it for me" send the text you type, or the photos you choose, to Google\'s Gemini service to produce an answer.',
        ],
      },
      {
        heading: 'Deleting your information',
        body: [
          'You can delete any listing, with its photos, from your profile.',
          'To delete your account and everything attached to it, open Edit profile and choose Delete account.',
          'Identity document photos are deleted 30 days after the check is decided, or 90 days after we ask for a new photo if none arrives. The result of the check is kept.',
        ],
      },
    ],
  },
};
