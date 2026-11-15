/**
 * French, second file: everything outside the core set in i18n-fr.ts. Same
 * rule: the key is the English text exactly as the code has it, including
 * punctuation. `node scripts/i18n-missing.mjs` lists English strings that
 * have no line in either file.
 *
 * Help pages are here in full. They are statements to users about their
 * safety and their data, so when the English changes, change the French in
 * the same commit; a stale translation there is a false statement.
 */
export const FR_MORE: Record<string, string> = {
  // Sign-in and setup
  'Landlords and tenants see your name when you message them. Your phone number and email stay private.':
    'Les propriétaires et les locataires voient votre nom quand vous leur écrivez. Votre numéro de téléphone et votre e-mail restent privés.',
  'This sets up your home screen. You can change it any time from your profile, and it never stops you doing the other.':
    'Cela organise votre écran d’accueil. Vous pouvez le changer à tout moment depuis votre profil, et cela ne vous empêche jamais de faire l’autre.',
  'Your name': 'Votre nom',
  'Rentals in Kigali from landlords we have checked, without the group-chat scroll.':
    'Des locations à Kigali, proposées par des propriétaires que nous avons vérifiés, sans faire défiler des groupes de discussion.',
  'By continuing you agree to receive messages in the app about listings you ask about.':
    'En continuant, vous acceptez de recevoir dans l’application des messages sur les annonces qui vous intéressent.',
  'Enter your code': 'Saisissez votre code',
  'Verification code': 'Code de vérification',
  'Starting up…': 'Démarrage…',

  // Explore
  Grid: 'Grille',
  'Large photos': 'Grandes photos',
  Map: 'Carte',
  'No filters found': 'Aucun critère trouvé',
  'Try naming a price, area, or property type — for example "2 bedroom in Remera under 300,000".':
    'Indiquez un prix, un quartier ou un type de logement, par exemple « 2 chambres à Remera à moins de 300 000 ».',
  'Search failed': 'La recherche a échoué',
  'Search saved': 'Recherche enregistrée',
  'We will notify you when a new rental matches. Find it under Saved searches on your profile.':
    'Nous vous préviendrons quand une nouvelle location correspondra. Retrouvez-la dans « Recherches enregistrées » sur votre profil.',
  'Not saved': 'Non enregistré',
  'The map is only available in the mobile app.': 'La carte n’est disponible que dans l’application mobile.',
  'Load more': 'Afficher plus',
  'No photos yet': 'Pas encore de photos',
  '/ mo': '/ mois',
  '/ month': '/ mois',

  // Messages
  'Loading your messages…': 'Chargement de vos messages…',
  'Nothing archived': 'Rien d’archivé',
  'Archived conversations appear here.': 'Les conversations archivées apparaissent ici.',
  About: 'À propos de',
  'No longer listed': 'N’est plus en ligne',
  'Paying safely': 'Payer en toute sécurité',
  'You blocked this person.': 'Vous avez bloqué cette personne.',
  'Why?': 'Pourquoi ?',
  'Loading the conversation…': 'Chargement de la conversation…',
  'Load earlier messages': 'Afficher les messages précédents',
  'Message not sent': 'Message non envoyé',
  'Could not block': 'Blocage impossible',
  'Report this message?': 'Signaler ce message ?',
  'Could not open the conversation': 'Impossible d’ouvrir la conversation',
  Conversation: 'Conversation',

  // Posting and editing a listing
  'Property type': 'Type de logement',
  'Drop a pin': 'Placer un repère',
  'Rwanda Rentals checks every listing before it goes live, so tenants know it is real.':
    'Rwanda Rentals vérifie chaque annonce avant sa mise en ligne, pour que les locataires sachent qu’elle est réelle.',
  'Your ID has not been checked yet, so this listing will wait for it. Verify your ID →':
    'Votre identité n’a pas encore été vérifiée ; cette annonce attendra donc. Vérifier votre identité →',
  'Your account is suspended': 'Votre compte est suspendu',
  'Choose photos': 'Choisir des photos',
  'Bright 2-bedroom near Kimironko market': 'Deux chambres lumineuses près du marché de Kimironko',
  'Water and electricity included, secure compound, 10 minutes from the bus stop…':
    'Eau et électricité comprises, enceinte sécurisée, à 10 minutes de l’arrêt de bus…',
  'Near Kimironko market, KG 11 Ave': 'Près du marché de Kimironko, KG 11 Ave',
  'Private. Tenants see the sector and an approximate area only.':
    'Privé. Les locataires ne voient que le secteur et une zone approximative.',
  'Keep mine': 'Garder la mienne',
  Replace: 'Remplacer',
  'Nothing to describe yet': 'Rien à décrire pour le moment',
  'The photos were not clear enough to describe. Try adding a wider shot of the room, or write the description yourself.':
    'Les photos n’étaient pas assez nettes pour être décrites. Ajoutez une vue plus large de la pièce, ou rédigez la description vous-même.',
  'Could not write a description': 'Impossible de rédiger une description',
  'Replace your description?': 'Remplacer votre description ?',
  'What you have written will be replaced by one written from your photos.':
    'Ce que vous avez écrit sera remplacé par un texte rédigé à partir de vos photos.',
  'Submitted for review': 'Soumise pour vérification',
  'Could not submit': 'Envoi impossible',
  New: 'Nouveau',
  'Changing the district, sector or address sends the listing back for review, and its checks are done again.':
    'Modifier le district, le secteur ou l’adresse renvoie l’annonce en vérification, et ses contrôles sont refaits.',
  'Loading listing…': 'Chargement de l’annonce…',
  'Edit listing': 'Modifier l’annonce',
  'Could not save': 'Enregistrement impossible',
  'Nothing to describe': 'Rien à décrire',
  'The photos did not show enough. Write a few lines yourself.':
    'Les photos n’en montraient pas assez. Écrivez quelques lignes vous-même.',
  'Could not write it': 'Rédaction impossible',
  'Choose one or both. At least one has to stay on.':
    'Choisissez l’un ou les deux. Au moins un doit rester activé.',
  'Only tick what the place really has. Renters filter on these.':
    'Ne cochez que ce que le logement possède vraiment. Les locataires filtrent sur ces critères.',
  'Size (m²)': 'Surface (m²)',
  Optional: 'Facultatif',
  'Deposit (RWF)': 'Caution (RWF)',
  'Leave blank if there is no deposit to state.': 'Laissez vide s’il n’y a pas de caution à indiquer.',
  'Back to draft': 'Remettre en brouillon',
  'Mark rented (moved in)': 'Marquer comme loué (emménagé)',
  'You changed the location, so it has to be checked again.':
    'Vous avez modifié l’emplacement ; il doit donc être vérifié à nouveau.',
  'You changed the photos, so they have to be checked again.':
    'Vous avez modifié les photos ; elles doivent donc être vérifiées à nouveau.',
  'A renter asks, and you have 72 hours to accept or decline. Nothing is booked until you accept and they confirm.':
    'Un locataire fait une demande, et vous avez 72 heures pour accepter ou refuser. Rien n’est réservé tant que vous n’avez pas accepté et qu’il n’a pas confirmé.',
  'A renter whose move-in date and length of stay meet your terms books at once, without asking you first. They see the exact address straight away, and the listing leaves the feed.':
    'Un locataire dont la date d’emménagement et la durée respectent vos conditions réserve immédiatement, sans vous demander d’abord. Il voit tout de suite l’adresse exacte, et l’annonce quitte la liste.',

  // Your listings
  'Loading your listings…': 'Chargement de vos annonces…',
  'Nothing here': 'Rien ici',
  'No listings are in this group.': 'Aucune annonce dans ce groupe.',
  'Requests to answer': 'Demandes à traiter',
  'Unread messages': 'Messages non lus',
  'To confirm available': 'Disponibilité à confirmer',
  'That did not work': 'Cela n’a pas fonctionné',
  'Delete listing': 'Supprimer l’annonce',

  // Listing page
  'Open in Maps': 'Ouvrir dans Maps',
  'Could not open Maps': 'Impossible d’ouvrir Maps',
  'The property is somewhere in this circle. The exact address is shared once a booking is confirmed.':
    'Le logement se trouve quelque part dans ce cercle. L’adresse exacte est communiquée une fois la réservation confirmée.',
  'This listing has not been checked by Rwanda Rentals yet.':
    'Cette annonce n’a pas encore été vérifiée par Rwanda Rentals.',
  'Reading the listing…': 'Lecture de l’annonce…',
  'Message the landlord to ask': 'Écrire au propriétaire pour demander',
  'For example: is there parking?': 'Par exemple : y a-t-il un parking ?',
  'When can I move in?': 'Quand puis-je emménager ?',
  'How much is the deposit?': 'Quel est le montant de la caution ?',
  'Is it furnished?': 'Est-ce meublé ?',
  'What was checked?': 'Qu’est-ce qui a été vérifié ?',
  'Ask is unavailable.': 'Cette fonction est indisponible.',
  'Could not answer that. Try asking it another way.':
    'Impossible de répondre. Essayez de formuler autrement.',
  'Monthly lease': 'Bail au mois',
  'From people who rented this place through Rwanda Rentals.':
    'Par des personnes qui ont loué ce logement via Rwanda Rentals.',
  'Removed by staff. Hidden from everyone else.': 'Retiré par le personnel. Masqué pour tous les autres.',
  'Reply from the landlord': 'Réponse du propriétaire',
  Reply: 'Répondre',
  'Public, and you can reply once. Phone numbers and emails are removed.':
    'Public, et vous ne pouvez répondre qu’une fois. Les numéros de téléphone et les e-mails sont retirés.',
  Remove: 'Retirer',
  'Not posted': 'Non publié',
  'Remove this review?': 'Retirer cet avis ?',
  'It is hidden from everyone but staff.': 'Il est masqué pour tout le monde sauf le personnel.',
  'Not removed': 'Non retiré',
  'ID checked': 'Identité vérifiée',
  'Property checked': 'Logement vérifié',
  'Authorized to list': 'Autorisé à louer',
  'Details reviewed': 'Détails vérifiés',
  'Rwanda Rentals checked this landlord\'s identity document.':
    'Rwanda Rentals a vérifié la pièce d’identité de ce propriétaire.',
  'Rwanda Rentals confirmed this property exists at the stated location.':
    'Rwanda Rentals a confirmé que ce logement existe à l’emplacement indiqué.',
  'The advertiser showed they are allowed to rent this property out.':
    'L’annonceur a montré qu’il est autorisé à louer ce logement.',
  'The rent, terms and photos were reviewed against the property.':
    'Le loyer, les conditions et les photos ont été comparés au logement.',
  'Water tank': 'Réservoir d’eau',
  'Backup power': 'Alimentation de secours',
  'Hot water': 'Eau chaude',
  Parking: 'Parking',
  'Security guard': 'Gardien',
  'Fenced compound': 'Enceinte clôturée',
  'Wi-Fi': 'Wi-Fi',
  Balcony: 'Balcon',
  Garden: 'Jardin',
  'Pets allowed': 'Animaux acceptés',

  // Saved and compare
  'This listing has been removed.': 'Cette annonce a été retirée.',
  'Loading saved rentals…': 'Chargement des locations enregistrées…',
  'The lowest rent and deposit are in bold. Terms and amenities are as stated by each landlord. Tap a photo to open that rental.':
    'Le loyer et la caution les plus bas sont en gras. Les conditions et les équipements sont ceux indiqués par chaque propriétaire. Touchez une photo pour ouvrir la location.',
  'Nothing to compare': 'Rien à comparer',
  'Pick rentals from Saved.': 'Choisissez des locations dans vos favoris.',
  'Loading rentals…': 'Chargement des locations…',
  'Not enough to compare': 'Pas assez pour comparer',
  'Some of these rentals are no longer listed.': 'Certaines de ces locations ne sont plus en ligne.',
  'Rent per month': 'Loyer par mois',
  Type: 'Type',
  Availability: 'Disponibilité',
  'Checks by Rwanda Rentals': 'Vérifications par Rwanda Rentals',

  // Booking
  'No payment is taken in the app. Never pay before you have seen the place.':
    'Aucun paiement n’est effectué dans l’application. Ne payez jamais avant d’avoir vu le logement.',
  'Day / month / year': 'Jour / mois / année',
  'Sent as a chat message. Phone numbers and emails are hidden until the booking is confirmed.':
    'Envoyé comme un message. Les numéros de téléphone et les e-mails sont masqués jusqu’à la confirmation de la réservation.',
  'Could not book': 'Réservation impossible',
  'Loading your bookings…': 'Chargement de vos réservations…',
  'Open a rental and choose Request to book. It will appear here.':
    'Ouvrez une location et choisissez « Demander à réserver ». Elle apparaîtra ici.',
  'When someone asks to book one of your listings, you answer it here.':
    'Quand quelqu’un demande à réserver l’une de vos annonces, vous répondez ici.',
  Listing: 'Annonce',
  Chat: 'Discussion',
  'Payment needed': 'Paiement requis',
  'Payment received': 'Paiement reçu',
  Renter: 'Locataire',
  Landlord: 'Propriétaire',

  // Profile and account
  'Your listings are hidden and you cannot post new ones until this is lifted.':
    'Vos annonces sont masquées et vous ne pouvez pas en publier de nouvelles tant que la suspension n’est pas levée.',
  'What this means and how to appeal': 'Ce que cela signifie et comment contester',
  'Switch to hosting': 'Passer en mode propriétaire',
  'Sign out?': 'Se déconnecter ?',
  'You will need a new code to sign back in.': 'Il vous faudra un nouveau code pour vous reconnecter.',
  'Changes the tabs at the bottom of the app. Nothing you have posted or booked is affected.':
    'Modifie les onglets en bas de l’application. Rien de ce que vous avez publié ou réservé n’est affecté.',
  'French covers the main screens. Notifications and some details are still in English.':
    'Le français couvre l’application. Le texte des notifications et quelques détails restent en anglais.',
  'Removes your profile, listings, photos, saved rentals, bookings and conversations permanently. It is refused while a booking is in progress.':
    'Supprime définitivement votre profil, vos annonces, vos photos, vos favoris, vos réservations et vos conversations. C’est refusé tant qu’une réservation est en cours.',
  'Landlords and tenants see this when you message them.':
    'Les propriétaires et les locataires le voient quand vous leur écrivez.',
  'Delete everything': 'Tout supprimer',
  'Delete your account?': 'Supprimer votre compte ?',
  'Your profile, listings, photos, saved rentals, bookings and conversations are removed for good. This cannot be undone.':
    'Votre profil, vos annonces, vos photos, vos favoris, vos réservations et vos conversations sont supprimés pour de bon. C’est irréversible.',
  'Not deleted': 'Non supprimé',
  'Not changed': 'Non modifié',
  'Identity not checked yet.': 'Identité pas encore vérifiée.',
  'Live listings': 'Annonces en ligne',
  'This person has no live listings right now.': 'Cette personne n’a aucune annonce en ligne pour le moment.',
  'Loading profile…': 'Chargement du profil…',
  'Report this account': 'Signaler ce compte',

  // Verify identity
  'Why we ask': 'Pourquoi nous le demandons',
  'Every listing on Rwanda Rentals comes from a landlord whose identity we have checked. It is what keeps fake listings and deposit scams out.':
    'Chaque annonce sur Rwanda Rentals vient d’un propriétaire dont nous avons vérifié l’identité. C’est ce qui écarte les fausses annonces et les arnaques à la caution.',
  'What to send': 'Ce qu’il faut envoyer',
  'A clear photo of your national ID or passport. Add the back as a second photo if it carries information. Make sure the text is readable.':
    'Une photo nette de votre carte d’identité nationale ou de votre passeport. Ajoutez le verso en seconde photo s’il comporte des informations. Vérifiez que le texte est lisible.',
  'Who sees it': 'Qui la voit',
  'Checking your status…': 'Vérification de votre statut…',
  'Take photo': 'Prendre une photo',
  'Choose photo': 'Choisir une photo',
  'Send for review': 'Envoyer pour vérification',
  'Sent for review': 'Envoyé pour vérification',
  'Rwanda Rentals will check your ID. Your listings go live once it is approved.':
    'Rwanda Rentals va vérifier votre identité. Vos annonces seront mises en ligne une fois celle-ci approuvée.',
  'Could not send': 'Envoi impossible',
  'Waiting for review': 'En attente de vérification',
  'Changes requested': 'Modifications demandées',
  'Not approved': 'Non approuvé',
  Approved: 'Approuvé',

  // Notifications
  'Alert me about': 'M’alerter pour',
  'Account and safety': 'Compte et sécurité',
  'ID checks, suspensions and the result of reports you send. These are always on.':
    'Vérifications d’identité, suspensions et résultat de vos signalements. Toujours activé.',
  'These switches only decide whether your phone alerts you. The notifications list in the app always shows everything.':
    'Ces interrupteurs décident seulement si votre téléphone vous alerte. La liste des notifications dans l’application montre toujours tout.',
  'Loading your settings…': 'Chargement de vos réglages…',
  'Turn on push': 'Activer les notifications push',
  'Open phone settings': 'Ouvrir les réglages du téléphone',
  'Push notifications are on': 'Les notifications push sont activées',
  'This phone will alert you. Choose what about below.':
    'Ce téléphone vous alertera. Choisissez pour quoi ci-dessous.',
  'Push notifications are off': 'Les notifications push sont désactivées',
  'Turn them on to hear about replies when the app is closed.':
    'Activez-les pour être prévenu des réponses quand l’application est fermée.',
  'Push notifications are blocked': 'Les notifications push sont bloquées',
  'You turned them off for Rwanda Rentals in your phone settings.':
    'Vous les avez désactivées pour Rwanda Rentals dans les réglages de votre téléphone.',
  'Push is not available here': 'Le push n’est pas disponible ici',
  'Loading notifications…': 'Chargement des notifications…',
  'Nothing yet': 'Rien pour le moment',
  'Replies, decisions on your listings and changes to rentals you saved will appear here.':
    'Les réponses, les décisions sur vos annonces et les changements sur vos favoris apparaîtront ici.',
  'When someone writes to you. Muted conversations stay quiet either way.':
    'Quand quelqu’un vous écrit. Les conversations en sourdine restent silencieuses dans tous les cas.',
  'Requests, and when one is accepted, declined, confirmed or cancelled.':
    'Les demandes, et quand l’une est acceptée, refusée, confirmée ou annulée.',
  'When a listing you posted is approved, refused or needs changes.':
    'Quand une annonce que vous avez publiée est approuvée, refusée ou doit être modifiée.',
  'When a place you saved drops in price or stops being available.':
    'Quand un logement enregistré baisse de prix ou n’est plus disponible.',

  // Reviews
  'Thank you': 'Merci',
  'Could not post your review': 'Impossible de publier votre avis',

  // Saved searches
  'We notify you when a new rental matches one of these.':
    'Nous vous prévenons quand une nouvelle location correspond à l’une d’elles.',
  'Loading your searches…': 'Chargement de vos recherches…',
  'No saved searches': 'Aucune recherche enregistrée',
  'Set some filters on Explore, then tap Save this search. We will tell you when a new rental matches.':
    'Réglez des filtres dans Explorer, puis touchez « Enregistrer la recherche ». Nous vous préviendrons quand une nouvelle location correspondra.',
  'Delete this search?': 'Supprimer cette recherche ?',
  'You will stop getting alerts for it.': 'Vous ne recevrez plus d’alertes pour celle-ci.',

  // Reports
  'Loading your reports…': 'Chargement de vos signalements…',
  'No reports': 'Aucun signalement',
  'If a listing or a person looks wrong, report it from their page and it will show up here.':
    'Si une annonce ou une personne vous semble suspecte, signalez-la depuis sa page ; elle apparaîtra ici.',
  'What is wrong?': 'Quel est le problème ?',
  'The person you report is not told who reported them.':
    'La personne signalée ne sait pas qui l’a signalée.',
  'Nothing to report': 'Rien à signaler',
  'Go back and try again.': 'Revenez en arrière et réessayez.',
  'Do not include your phone number or other private details.':
    'N’indiquez pas votre numéro de téléphone ni d’autres informations privées.',
  'Report this message': 'Signaler ce message',
  'Report sent': 'Signalement envoyé',
  'Thank you. Our team will look at it. You can follow it under "Your reports" on your profile.':
    'Merci. Notre équipe va l’examiner. Vous pouvez le suivre dans « Vos signalements » sur votre profil.',
  'Could not send the report': 'Impossible d’envoyer le signalement',
  'You have already reported this. We are looking at it.':
    'Vous l’avez déjà signalé. Nous l’examinons.',
  'This property does not exist': 'Ce logement n’existe pas',
  'Not the real landlord': 'Ce n’est pas le vrai propriétaire',
  'The price is wrong': 'Le prix est faux',
  'It is no longer available': 'Il n’est plus disponible',
  'The photos are misleading': 'Les photos sont trompeuses',
  'The description is misleading': 'La description est trompeuse',
  'It is a duplicate listing': 'C’est une annonce en double',
  'It looks like a scam': 'Cela ressemble à une arnaque',
  Harassment: 'Harcèlement',
  'Inappropriate content': 'Contenu inapproprié',
  'Asked for payment in a suspicious way': 'A demandé un paiement de façon suspecte',
  'Something else': 'Autre chose',
  Received: 'Reçu',
  'Being reviewed': 'En cours d’examen',
  'No action taken': 'Aucune mesure prise',
  'We suspended the listing.': 'Nous avons suspendu l’annonce.',
  'We suspended the account.': 'Nous avons suspendu le compte.',

  // Help pages
  'Page not found': 'Page introuvable',
  'That help page does not exist.': 'Cette page d’aide n’existe pas.',
  'Contact support': 'Contacter l’assistance',
  'Our support address is being set up. Until it is, use Report on a listing, an account or a conversation to reach our team.':
    'Notre adresse d’assistance est en cours de mise en place. En attendant, utilisez « Signaler » sur une annonce, un compte ou une conversation pour joindre notre équipe.',
  'Write an email': 'Écrire un e-mail',
  'What the checks mean': 'Ce que signifient les vérifications',
  'Each badge names one thing a person at Rwanda Rentals checked.':
    'Chaque badge désigne une chose qu’une personne de Rwanda Rentals a vérifiée.',
  'We looked at a photo of the landlord\'s identity document and it matched the account.':
    'Nous avons examiné une photo de la pièce d’identité du propriétaire et elle correspondait au compte.',
  'It does not mean they own the property, or that they are honest.':
    'Cela ne signifie pas qu’il possède le logement, ni qu’il est honnête.',
  'We confirmed that the property exists at the location the landlord gave us.':
    'Nous avons confirmé que le logement existe à l’emplacement indiqué par le propriétaire.',
  'The advertiser showed us they are allowed to rent this property out, as owner or agent.':
    'L’annonceur nous a montré qu’il est autorisé à louer ce logement, en tant que propriétaire ou mandataire.',
  'We compared the rent, terms and photos against the property.':
    'Nous avons comparé le loyer, les conditions et les photos avec le logement.',
  'What a badge is not': 'Ce qu’un badge n’est pas',
  'A badge lowers the risk. It is not a guarantee, and a listing with no badge for something has simply not had that checked.':
    'Un badge réduit le risque. Ce n’est pas une garantie, et une annonce sans badge pour un point n’a simplement pas été vérifiée sur ce point.',
  '"Featured" is paid placement. It is not a check and says nothing about the listing.':
    '« En vedette » est un emplacement payant. Ce n’est pas une vérification et cela ne dit rien de l’annonce.',
  'Always see the place yourself before you pay anything.':
    'Visitez toujours le logement vous-même avant de payer quoi que ce soit.',
  'Never pay before you have seen the place.': 'Ne payez jamais avant d’avoir vu le logement.',
  'The one rule': 'La seule règle',
  'Do not send money for a place you have not visited: no deposit, no "holding fee", no "viewing fee".':
    'N’envoyez pas d’argent pour un logement que vous n’avez pas visité : ni caution, ni « frais de réservation », ni « frais de visite ».',
  'Rwanda Rentals does not take payments in the app yet. Anyone who says a payment is "through Rwanda Rentals" is lying.':
    'Rwanda Rentals n’encaisse pas encore de paiements dans l’application. Quiconque prétend qu’un paiement passe « par Rwanda Rentals » ment.',
  'Common MoMo scams': 'Arnaques MoMo courantes',
  '"Many people want it, send a deposit now to hold it." A real landlord can wait for a viewing.':
    '« Beaucoup de gens le veulent, envoyez une caution maintenant pour le réserver. » Un vrai propriétaire peut attendre une visite.',
  '"I am out of the country, pay and my cousin will give you the key." There is no key.':
    '« Je suis à l’étranger, payez et mon cousin vous donnera la clé. » Il n’y a pas de clé.',
  '"I sent you money by mistake, please send it back." Check your own balance first, not the SMS.':
    '« Je vous ai envoyé de l’argent par erreur, renvoyez-le s’il vous plaît. » Vérifiez d’abord votre propre solde, pas le SMS.',
  'Being asked to dial a code starting with *182* that you do not understand. Dialling it can approve a payment from your account.':
    'On vous demande de composer un code commençant par *182* que vous ne comprenez pas. Le composer peut valider un paiement depuis votre compte.',
  'When you do pay': 'Au moment de payer',
  'Pay the person you met, at the property, after you have seen it and agreed the terms.':
    'Payez la personne que vous avez rencontrée, sur place, après avoir vu le logement et convenu des conditions.',
  'Check that the name on the MoMo account matches the landlord you have been dealing with.':
    'Vérifiez que le nom du compte MoMo correspond au propriétaire avec qui vous avez traité.',
  'Ask for a signed receipt or a written agreement, and keep a photo of it.':
    'Demandez un reçu signé ou un accord écrit, et gardez-en une photo.',
  'If something feels wrong': 'Si quelque chose vous semble anormal',
  'Stop, and report the listing or the conversation. Reports are private.':
    'Arrêtez, et signalez l’annonce ou la conversation. Les signalements sont confidentiels.',
  'Why contact details are hidden': 'Pourquoi les coordonnées sont masquées',
  'Phone numbers and emails in messages show as ••• until a booking is confirmed.':
    'Les numéros de téléphone et les e-mails dans les messages s’affichent ••• jusqu’à la confirmation d’une réservation.',
  'What is hidden': 'Ce qui est masqué',
  'Phone numbers, email addresses and MoMo codes typed into a message are replaced with ••• before the message is delivered. The other person never receives them.':
    'Les numéros de téléphone, les adresses e-mail et les codes MoMo saisis dans un message sont remplacés par ••• avant la remise du message. L’autre personne ne les reçoit jamais.',
  'This applies to both sides, landlords and renters.':
    'Cela s’applique aux deux parties, propriétaires comme locataires.',
  Why: 'Pourquoi',
  'Most rental scams start by moving the conversation somewhere nobody can see it. Keeping it here means there is a record, and a report can be acted on.':
    'La plupart des arnaques à la location commencent par déplacer la conversation là où personne ne peut la voir. La garder ici permet d’en conserver une trace et de donner suite à un signalement.',
  'It also keeps your number away from people you have only just started talking to.':
    'Cela évite aussi de donner votre numéro à des personnes à qui vous venez à peine de parler.',
  'When it stops': 'Quand cela s’arrête',
  'Once a booking between you is confirmed, new messages are delivered as typed, and you can exchange numbers. The exact address is shared at the same moment.':
    'Une fois la réservation confirmée entre vous, les nouveaux messages sont remis tels quels, et vous pouvez échanger vos numéros. L’adresse exacte est communiquée au même moment.',
  'Messages sent before that stay as they were delivered.':
    'Les messages envoyés auparavant restent tels qu’ils ont été remis.',
  'Reports and appeals': 'Signalements et contestations',
  'How to report, what happens next, and what to do if we got it wrong.':
    'Comment signaler, ce qui se passe ensuite, et que faire si nous nous sommes trompés.',
  'How to report': 'Comment signaler',
  'Listing: "Report this listing" at the bottom of its page.':
    'Annonce : « Signaler cette annonce » en bas de sa page.',
  'Person: open their page from a listing and choose "Report this account".':
    'Personne : ouvrez sa page depuis une annonce et choisissez « Signaler ce compte ».',
  'Conversation or message: the menu in the conversation, or press and hold a message.':
    'Conversation ou message : le menu de la conversation, ou un appui long sur un message.',
  'What happens next': 'Ce qui se passe ensuite',
  'A member of our team looks at it. The person you report is not told who reported them.':
    'Un membre de notre équipe l’examine. La personne signalée ne sait pas qui l’a signalée.',
  'You can follow the result under "Your reports" on your profile, and we notify you when it is decided.':
    'Vous pouvez suivre le résultat dans « Vos signalements » sur votre profil, et nous vous prévenons quand la décision est prise.',
  'If the report is about a conversation, the reviewer can read that conversation while the report is open. Every such look is recorded.':
    'Si le signalement concerne une conversation, l’examinateur peut la lire tant que le signalement est ouvert. Chaque consultation est enregistrée.',
  'If your listing or account was suspended': 'Si votre annonce ou votre compte a été suspendu',
  'The reason is shown on your profile. A suspended listing is hidden from everyone else; a suspended account cannot post or send messages, but you can still sign in.':
    'La raison est indiquée sur votre profil. Une annonce suspendue est masquée pour tous les autres ; un compte suspendu ne peut ni publier ni envoyer de messages, mais vous pouvez toujours vous connecter.',
  'If you think the decision was wrong, contact support with your account name and what you want us to look at again.':
    'Si vous pensez que la décision est erronée, contactez l’assistance en indiquant le nom de votre compte et ce que vous souhaitez que nous réexaminions.',
  'Your information': 'Vos informations',
  'What we collect, why, who can see it, and how to have it deleted.':
    'Ce que nous recueillons, pourquoi, qui peut le voir, et comment le faire supprimer.',
  'What we collect': 'Ce que nous recueillons',
  'Your sign-in email or phone number, and the name you give.':
    'Votre e-mail ou numéro de téléphone de connexion, et le nom que vous indiquez.',
  'Listings you post: details, photos, and the exact location.':
    'Les annonces que vous publiez : détails, photos et emplacement exact.',
  'If you verify as a landlord: photos of your identity document.':
    'Si vous vous faites vérifier comme propriétaire : des photos de votre pièce d’identité.',
  'Messages you send, rentals you save, and reports you make.':
    'Les messages que vous envoyez, les locations que vous enregistrez et les signalements que vous faites.',
  'A push token for your phone, if you turn notifications on.':
    'Un jeton push pour votre téléphone, si vous activez les notifications.',
  'Not your location. If you let the map use it, it stays on your phone and is not saved. To find places, the app sends the area shown on the map, rounded to about a kilometre.':
    'Pas votre position. Si vous laissez la carte l’utiliser, elle reste sur votre téléphone et n’est pas enregistrée. Pour trouver des logements, l’application envoie la zone affichée sur la carte, arrondie à environ un kilomètre.',
  'Who can see what': 'Qui peut voir quoi',
  'Other users see your name, your live listings, and which checks you passed. They never see your phone number or email.':
    'Les autres utilisateurs voient votre nom, vos annonces en ligne et les vérifications que vous avez passées. Ils ne voient jamais votre numéro de téléphone ni votre e-mail.',
  'A listing\'s exact address and map pin are private. Others see an approximate area until a booking with them is confirmed.':
    'L’adresse exacte et le repère sur la carte d’une annonce sont privés. Les autres voient une zone approximative jusqu’à la confirmation d’une réservation avec eux.',
  'Identity documents are seen only by our verification staff.':
    'Les pièces d’identité ne sont vues que par notre personnel de vérification.',
  'Messages are seen by the two people in the conversation. Our staff can read a conversation only while a report about it is open.':
    'Les messages sont vus par les deux personnes de la conversation. Notre personnel ne peut lire une conversation que lorsqu’un signalement la concernant est ouvert.',
  'Where it is kept': 'Où elles sont conservées',
  'On servers in the European Union (Frankfurt), run by our hosting provider.':
    'Sur des serveurs dans l’Union européenne (Francfort), gérés par notre hébergeur.',
  'The search assistant and "Write it for me" send the text you type, or the photos you choose, to Google\'s Gemini service to produce an answer.':
    'La recherche assistée et « Rédiger pour moi » envoient le texte que vous saisissez, ou les photos que vous choisissez, au service Gemini de Google pour produire une réponse.',
  'Deleting your information': 'Supprimer vos informations',
  'You can delete any listing, with its photos, from your profile.':
    'Vous pouvez supprimer n’importe quelle annonce, avec ses photos, depuis votre profil.',
  'To delete your account and everything attached to it, open Edit profile and choose Delete account.':
    'Pour supprimer votre compte et tout ce qui y est rattaché, ouvrez « Modifier le profil » et choisissez « Supprimer le compte ».',

  // Staff console
  'The review queue is for Rwanda Rentals verification staff.':
    'La file de vérification est réservée au personnel de vérification de Rwanda Rentals.',
  'Loading the queue…': 'Chargement de la file…',
  All: 'Tout',
  Landlords: 'Propriétaires',
  'Nothing to review': 'Rien à vérifier',
  'New submissions will appear here.': 'Les nouvelles demandes apparaîtront ici.',
  'Your view of this address was logged.': 'Votre consultation de cette adresse a été enregistrée.',
  Documents: 'Documents',
  'No documents arrived. Request changes and ask them to send the photo again.':
    'Aucun document n’est arrivé. Demandez des modifications et faites renvoyer la photo.',
  'A document could not be loaded.': 'Un document n’a pas pu être chargé.',
  'Links expire after a few minutes.': 'Les liens expirent après quelques minutes.',
  'What you checked': 'Ce que vous avez vérifié',
  'Each ticked check becomes a badge tenants see. Only tick what you actually verified.':
    'Chaque case cochée devient un badge visible par les locataires. Ne cochez que ce que vous avez réellement vérifié.',
  'This page is for verification staff.': 'Cette page est réservée au personnel de vérification.',
  'Loading the case…': 'Chargement du dossier…',
  'Show exact address': 'Afficher l’adresse exacte',
  'Note to the landlord': 'Note au propriétaire',
  'Required to request changes or refuse.': 'Obligatoire pour demander des modifications ou refuser.',
  Approve: 'Approuver',
  'Request changes': 'Demander des modifications',
  Reject: 'Rejeter',
  'Add a note': 'Ajoutez une note',
  'Tell the landlord what to fix or why it was refused.':
    'Indiquez au propriétaire ce qu’il doit corriger ou pourquoi c’est refusé.',
  'Could not record the decision': 'Impossible d’enregistrer la décision',
  'Could not load the address': 'Impossible de charger l’adresse',
  'Loading the log…': 'Chargement du journal…',
  'One subject · show all': 'Un seul sujet · tout afficher',
  'Nothing recorded': 'Rien d’enregistré',
  'No actions match this filter.': 'Aucune action ne correspond à ce filtre.',
  'Loading bookings…': 'Chargement des réservations…',
  'No bookings': 'Aucune réservation',
  'Nothing matches this filter.': 'Rien ne correspond à ce filtre.',
  'Why it is being cancelled': 'Motif de l’annulation',
  'Required. Shown to both people in their conversation.':
    'Obligatoire. Affiché aux deux personnes dans leur conversation.',
  'Cancel this booking…': 'Annuler cette réservation…',
  'Both people will read why the booking was cancelled.':
    'Les deux personnes liront pourquoi la réservation a été annulée.',
  'Read this conversation?': 'Lire cette conversation ?',
  'You will see what both people typed, including contact details that were hidden from them. Your look is recorded with your name and this report.':
    'Vous verrez ce que les deux personnes ont écrit, y compris les coordonnées qui leur étaient masquées. Votre consultation est enregistrée avec votre nom et ce signalement.',
  'Your view of this conversation was logged.': 'Votre consultation de cette conversation a été enregistrée.',
  'No messages.': 'Aucun message.',
  'This page is for Rwanda Rentals staff.': 'Cette page est réservée au personnel de Rwanda Rentals.',
  'Show the conversation': 'Afficher la conversation',
  Queues: 'Files d’attente',
  'Look up': 'Rechercher',
  'Listings by status': 'Annonces par statut',
  'New each week': 'Nouveautés par semaine',
  'Week of': 'Semaine du',
  Users: 'Utilisateurs',
  Conversations: 'Conversations',
  'Counts only. No third-party analytics is installed.':
    'Des décomptes uniquement. Aucun outil d’analyse tiers n’est installé.',
  'Loading the console…': 'Chargement de la console…',
  Verification: 'Vérification',
  Reports: 'Signalements',
  'Flagged messages': 'Messages signalés automatiquement',
  'Audit log': 'Journal d’audit',
  'Staff roles': 'Rôles du personnel',
  'Search by title': 'Rechercher par titre',
  'Part of a listing\'s title': 'Une partie du titre d’une annonce',
  'Any status': 'Tous les statuts',
  'Searching…': 'Recherche…',
  'No listings found': 'Aucune annonce trouvée',
  'Try another title or status.': 'Essayez un autre titre ou statut.',
  Moderation: 'Modération',
  'This is your own listing. Another staff member must moderate it.':
    'C’est votre propre annonce. Un autre membre du personnel doit la modérer.',
  'None.': 'Aucun.',
  'Loading the listing…': 'Chargement de l’annonce…',
  'Open the listing page': 'Ouvrir la page de l’annonce',
  'Activity on this listing': 'Activité sur cette annonce',
  'The landlord will read it.': 'Le propriétaire la lira.',
  'Reports are handled by Rwanda Rentals staff.':
    'Les signalements sont traités par le personnel de Rwanda Rentals.',
  'Loading reports…': 'Chargement des signalements…',
  Resolved: 'Résolu',
  Dismissed: 'Classé sans suite',
  'This listing has been deleted.': 'Cette annonce a été supprimée.',
  'This account has been deleted.': 'Ce compte a été supprimé.',
  'The conversation is closed to staff now that this report is closed.':
    'La conversation n’est plus accessible au personnel, ce signalement étant clos.',
  Severity: 'Gravité',
  'Setting a severity marks the report as in review.':
    'Définir une gravité marque le signalement comme en cours d’examen.',
  'Loading the report…': 'Chargement du signalement…',
  'Open listing': 'Ouvrir l’annonce',
  'Open profile': 'Ouvrir le profil',
  'Read the conversation (logged)': 'Lire la conversation (enregistré)',
  Note: 'Note',
  'Suspending or restoring: the landlord reads this. Resolving or dismissing: the reporter reads it.':
    'Suspension ou rétablissement : le propriétaire lit ceci. Résolution ou classement : l’auteur du signalement le lit.',
  'Suspend listing': 'Suspendre l’annonce',
  'Restore listing': 'Rétablir l’annonce',
  'Suspend account': 'Suspendre le compte',
  'Restore account': 'Rétablir le compte',
  'Resolve with this reply': 'Résoudre avec cette réponse',
  'Dismiss: no action': 'Classer : aucune mesure',
  'The person affected by this action will read it.': 'La personne concernée par cette mesure la lira.',
  'To add someone, find their account under Users and grant the role there.':
    'Pour ajouter quelqu’un, trouvez son compte dans Utilisateurs et attribuez-lui le rôle.',
  'Admins only': 'Réservé aux administrateurs',
  'Only an admin can see and change staff roles.':
    'Seul un administrateur peut voir et modifier les rôles du personnel.',
  'Loading staff…': 'Chargement du personnel…',
  'Find an account': 'Trouver un compte',
  'Or add this key by hand': 'Ou ajoutez cette clé à la main',
  'Type the 6-digit code from your authenticator app to open the staff console.':
    'Saisissez le code à 6 chiffres de votre application d’authentification pour ouvrir la console du personnel.',
  'Lost the phone with your authenticator? Another admin can remove and re-grant your role, and you set this up again.':
    'Vous avez perdu le téléphone avec votre application d’authentification ? Un autre administrateur peut retirer puis réattribuer votre rôle, et vous refaites cette configuration.',
  'Checking your sign-in…': 'Vérification de votre connexion…',
  'Open my authenticator app': 'Ouvrir mon application d’authentification',
  '6-digit code': 'Code à 6 chiffres',
  'Search by name': 'Rechercher par nom',
  'A name, or part of one': 'Un nom, ou une partie',
  'Nobody found': 'Personne trouvé',
  'No account has a name like that.': 'Aucun compte ne porte un nom semblable.',
  'Account status': 'État du compte',
  'In good standing.': 'En règle.',
  'Loading the account…': 'Chargement du compte…',
  'Open ID case': 'Ouvrir le dossier d’identité',
  'Activity on this account': 'Activité sur ce compte',
  'Note to the account\'s owner': 'Note au titulaire du compte',
  'Required. They read it in the app.': 'Obligatoire. Il la lit dans l’application.',
  High: 'Élevée',
  Medium: 'Moyenne',
  Low: 'Faible',
  'Sent back for review': 'Renvoyé pour vérification',
  Refused: 'Refusé',
  'Asked for changes': 'Modifications demandées',
  'Looked at the exact address': 'A consulté l’adresse exacte',
  'Set report severity': 'A défini la gravité du signalement',
  'Resolved a report': 'A résolu un signalement',
  'Dismissed a report': 'A classé un signalement',
  'Suspended a listing': 'A suspendu une annonce',
  'Restored a listing': 'A rétabli une annonce',
  'Suspended an account': 'A suspendu un compte',
  'Restored an account': 'A rétabli un compte',
  'Read a reported conversation': 'A lu une conversation signalée',
  'Granted a role': 'A attribué un rôle',
  'Removed a role': 'A retiré un rôle',
  'Cancelled a booking': 'A annulé une réservation',
  'Sent back to review after an edit': 'Renvoyé en vérification après une modification',

  // Templates: {name} is filled in by the code
  'Enter the {n}-digit code.': 'Saisissez le code à {n} chiffres.',
  'Resend in {n}s': 'Renvoyer dans {n} s',
  'Archived ({n})': 'Archivées ({n})',
  'You: ': 'Vous : ',
  'Uploading photo {done} of {total}…': 'Envoi de la photo {done} sur {total}…',
  'Add {n} or more photos for a fuller description.':
    'Ajoutez {n} photos ou plus pour une description plus complète.',
  '{live} live · {total} in all': '{live} en ligne · {total} au total',
  '{n} waiting for you': '{n} en attente de votre réponse',
  'Choose {min} to {max} · {n} chosen': 'Choisissez-en {min} à {max} · {n} sélectionnées',
  '{n} saved': '{n} enregistrées',
  'Select at least {n}': 'Sélectionnez-en au moins {n}',
  'Compare {n}': 'Comparer {n}',
  ' (was {price})': ' (était {price})',
  ' · deposit {price}': ' · caution {price}',
  'Available from {date}': 'Disponible à partir du {date}',
  ' · minimum stay {n} months': ' · durée minimale {n} mois',
  'Places I am booking ({n})': 'Mes réservations ({n})',
  'Requests for my listings ({n})': 'Demandes pour mes annonces ({n})',
  'Confirmed {ago}': 'Confirmée {ago}',
  'Block {name}?': 'Bloquer {name} ?',
  'this person': 'cette personne',
  unknown: 'inconnu',
  '{n} bed': '{n} chambre',
  '{n} beds': '{n} chambres',
  '{n} bath': '{n} salle de bain',
  '{n} baths': '{n} salles de bain',
  ' · Availability confirmed {ago}': ' · Disponibilité confirmée {ago}',
  'Posted {ago}': 'Publiée {ago}',
  'This listing is: {status}.': 'Statut de cette annonce : {status}.',
  'Suspended by Rwanda Rentals: {note}': 'Suspendue par Rwanda Rentals : {note}',
  'Confirmed available {ago}': 'Disponibilité confirmée {ago}',
  '"{title}" and its photos will be removed permanently.':
    '« {title} » et ses photos seront supprimées définitivement.',
  'Landlord: {name}': 'Propriétaire : {name}',
  'Renter: {name}': 'Locataire : {name}',
  'Other landlords rated this renter {avg} of 5 ({n}).':
    'D’autres propriétaires ont noté ce locataire {avg} sur 5 ({n}).',
  ' · {n} without a location': ' · {n} sans emplacement',
  // Two-way switches
  Archived: 'Archivées',
  Hosting: 'Hôte',
  // Map: near me
  'Show places near me': 'Afficher les logements près de moi',
  'Search this area': 'Rechercher dans cette zone',
  'Looking in this area…': 'Recherche dans cette zone…',
  '{shown} of {total} places in this area': '{shown} sur {total} logements dans cette zone',
  'areas are approximate': 'zones approximatives',
  'No places here match. Zoom out or move the map, then search this area.':
    'Aucun logement ne correspond ici. Dézoomez ou déplacez la carte, puis recherchez dans cette zone.',
  'Could not load this area. Check your connection.':
    'Impossible de charger cette zone. Vérifiez votre connexion.',
  'You seem to be outside Rwanda, so the map shows Kigali.':
    'Vous semblez être hors du Rwanda, la carte affiche donc Kigali.',
  'Location is off for this app': 'La localisation est désactivée pour cette application',
  'Allow location for Rwanda Rentals in your phone settings to see places near you.':
    'Autorisez la localisation pour Rwanda Rentals dans les réglages du téléphone pour voir les logements près de vous.',
  'Not now': 'Pas maintenant',
  'Open settings': 'Ouvrir les réglages',
  'Could not find you': 'Position introuvable',
  'Check that location is switched on, then try again.':
    'Vérifiez que la localisation est activée, puis réessayez.',
  'Show all {n} reviews': 'Afficher les {n} avis',
  ' · {n} more check': ' · {n} autre vérification',
  ' · {n} more checks': ' · {n} autres vérifications',
  'Enter a size between {min} and {max} m².': 'Indiquez une surface entre {min} et {max} m².',
  'In progress': 'En cours',
  'Off the feed': 'Hors ligne',
  'French covers the app. The text of notifications and a few details are still in English.':
    'Le français couvre l’application. Le texte des notifications et quelques détails restent en anglais.',
};
