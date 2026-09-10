/**
 * The measures each indicator recognises, and the words that describe them.
 *
 * A band that reads "DPO and DPIA OR only DPO requirement" cannot be evaluated unless the reading
 * distinguished an officer from an assessment, so the distinction has to be a fact the reader
 * reports rather than something inferred from prose afterwards. Every token below is here because
 * an indicator's own text names it.
 *
 * The gloss does two jobs, and the second was not planned. It tells the reader what the token
 * means -- and it is also the best retrieval query the rubric can produce, because it says what a
 * measure does in the language a statute would use rather than the language a methodology sheet
 * uses. Measured on Singapore: asked for "Minimum period of data retention requirement", the
 * corpus returned the Personal Data Protection Act's own sections and nothing else; asked for "a
 * duty to keep records or data for at least some period" it returned the Employment Act at rank 4,
 * the Companies Act at 9 and the Income Tax Act at 10 -- the three instruments the answer turns
 * on. The Criminal Procedure Code's power to access a computer went from absent to rank 7 the same
 * way.
 *
 * So the vocabulary lives here rather than in either stage: Zone 1 asks with it and Zone 2
 * answers in it.
 *
 * `actor` is the third job, added after a measured failure. Section 78 of the Telecommunications
 * Act -- a power for the regulator to require information -- was labelled as a duty to appoint a
 * data protection officer, and it scored a cell. Every gloss above it described *what* a measure
 * does and none described *whom* it binds, so "officer" was the nearest available token and the
 * reader took it. A regulator demanding information and an organisation appointing a compliance
 * officer are opposite ends of the same sentence; naming the actor makes them different questions
 * rather than nearby words.
 */
export interface Measure {
  token: string;
  /** What the measure requires, in the language a provision would use. Also a retrieval query. */
  gloss: string;
  /** The one thing a provision must say to be this measure. Answered as definingWords, and checked. */
  defines: string;
  /**
   * Extra retrieval phrasings, asked but never shown to the reader.
   *
   * The rubric says "data"; a statute says "records", "documents", "books of account". Measured on
   * Malaysia, the tax acts' duty to keep records in Malaysia is unreachable without this wording.
   */
  alsoAsked?: string[];
  /** Whom the provision binds or empowers. Compared against the actor the reader reads out. */
  actor: string;
  /**
   * Whether this measure is defined by *where* something has to be.
   *
   * Pillar 6 is entirely locational: a ban on sending data out, a duty to keep it in, a duty to
   * run it on facilities here. A provision that says nothing about place has not imposed one of
   * these measures however administrative its language sounds, and the reader is asked to quote
   * the words that state the place so that the claim is checkable in the same way a quote is.
   *
   * This is the indicator's own definition, not a filter fitted to anyone's answers: every band in
   * this pillar reads "out of the economy", "within the economy", "located in the economy".
   */
  locates?: boolean;
  /**
   * Whether this measure is defined by *someone being put in a role*.
   *
   * 7.4's officer measure is the only one, and it was scoring on provisions that appoint nobody:
   * a duty to obtain consent and a right of access were both filed as officer requirements. The
   * reader is asked to quote the words naming the position, so an absent role is a fact.
   */
  appoints?: boolean;
  /**
   * Whom the measure binds, as a side rather than as prose.
   *
   * `actor` above tells the reader what to look for; this is what Zone 3 can check. Section 47 of
   * Malaysia's Personal Data Protection Act -- the Minister appointing the Personal Data
   * Protection Commissioner -- scored 7.4 twice: it does put a person in a role, but the role is
   * the regulator's and the duty is the State's. A duty borne by the State is not a duty borne by
   * the regulated, whatever the words around it look like.
   */
  actorKind?: 'private' | 'state';
  /**
   * Whether this measure is made out by words that permit or limit rather than command.
   *
   * 7.5 scores "any measure that allows government to access data", and a power is not a duty, so
   * the requirement test was skipped for that indicator by name. Naming it on the measure instead
   * says why the exemption exists, and lets a power to impose customs duties use the same one.
   */
  permits?: boolean;
  /** Whether this measure is defined by something crossing the economy's border. */
  crossesBorder?: boolean;
}

/** Whoever the obligation falls on. Most of these measures bind the holder of the data. */
const HOLDER = 'the person or organisation that holds, handles or transfers the data';
const ORGANISATION = 'the organisation that collects, uses or discloses the personal data';

export const MEASURES: Record<string, Measure[]> = {
  '6.1': [
    {
      token: 'transfer-ban',
      defines: 'the words naming the country or territory the data may not go to or beyond',
      locates: true,
      gloss: 'a prohibition on transferring data out of the economy',
      actor: HOLDER,
    },
    {
      token: 'local-processing',
      defines: 'the words naming the country or territory the processing must happen in',
      locates: true,
      gloss: 'a requirement that data be processed within the economy',
      actor: HOLDER,
    },
  ],
  '6.2': [
    {
      token: 'local-storage',
      defines: 'the words naming the country, territory or jurisdiction the data must be kept in',
      locates: true,
      gloss: 'a requirement that data be stored or kept within the economy',
      alsoAsked: ['a requirement that records or documents be kept and retained within the economy'],
      actor: HOLDER,
    },
  ],
  '6.3': [
    {
      token: 'local-infrastructure',
      defines: 'the words naming the computing facilities, servers or equipment that must be in the economy',
      locates: true,
      gloss: 'a requirement to use computing facilities, servers or infrastructure located in the economy',
      actor: HOLDER,
    },
  ],
  // The gloss names the shape of the rule; the extras name it the way a privacy statute writes it,
  // which is how the cross-border disclosure principle is actually worded.
  '6.4': [
    {
      token: 'transfer-condition',
      defines: 'the words stating the condition that lets the data leave',
      locates: true,
      gloss:
        'a condition that must be met before data may be transferred out, the transfer being permitted once it is met',
      alsoAsked: [
        'cross-border disclosure of personal information to an overseas recipient',
        'before disclosing personal information overseas the discloser must take reasonable steps to ensure the recipient complies',
        'personal data may be transferred outside the economy only where the recipient affords a comparable standard of protection',
      ],
      actor: HOLDER,
    },
  ],
  // A duty to keep and a duty to stop keeping are opposite requirements, and the indicator scores
  // only the first: "Minimum period of data retention requirement". Singapore has both -- the PDPA
  // says stop retaining once the purpose ends, the Companies Act says keep for five years -- so a
  // reading that did not distinguish them would score the wrong one.
  '7.3': [
    {
      token: 'minimum-retention',
      defines: 'the words stating the period the data must be kept for',
      gloss:
        'a duty to keep data for at least some period, whether the period is stated here or prescribed elsewhere',
      alsoAsked: ['a duty to preserve records or documents for a stated number of years'],
      actor: 'the person or organisation required to keep the records or data',
    },
    {
      token: 'maximum-retention',
      defines: 'the words stating when the data must stop being kept',
      gloss: 'a duty to stop keeping data, or not to keep it longer than a purpose requires',
      actor: 'the person or organisation holding the data',
    },
  ],
  // Written out as duties rather than as the indicator's two acronyms. A provision imposing this
  // rarely uses the phrase "data protection officer" -- Singapore's is headed "Compliance with
  // Act" -- so the acronym is nearly useless both as a description and as a query.
  '7.4': [
    {
      token: 'data-protection-officer',
      defines: 'the words naming whoever must be appointed',
      appoints: true,
      actorKind: 'private',
      gloss:
        'a duty to appoint or designate one or more individuals responsible for ensuring the organisation complies with its data protection obligations',
      actor: ORGANISATION,
    },
    {
      token: 'impact-assessment',
      defines: 'the words naming the assessment that must be carried out',
      gloss:
        'a duty to assess the risks to personal data, or the effect on individuals, before carrying out the processing',
      actor: ORGANISATION,
    },
  ],
  // The one measure in these two pillars whose actor is the state rather than the regulated party.
  '7.5': [
    {
      token: 'government-access',
      defines:
        'the words by which the authority itself obtains the data or access to it, rather than a power to make rules, codes or standards about data',
      permits: true,
      gloss:
        'a power for a public authority to obtain, access, or require the disclosure of personal data held by someone else',
      actor: 'a public authority, officer or other government body exercising the power',
    },
  ],

  /* ---- Pillar 8. Both indicators here are about what an intermediary must do, and the bands
     separate watching from taking down. ---- */

  '8.3': [
    {
      token: 'user-identity',
      defines: 'the words requiring the user to be identified',
      gloss:
        'a requirement to establish who a user is before they may connect to the internet or use an online service',
      actor: 'the internet or online service provider',
    },
    {
      token: 'sim-registration',
      defines: 'the words requiring the subscriber identity to be recorded',
      gloss:
        'a requirement to record the identity of the person a SIM card or mobile subscription is issued to',
      actor: 'the telecommunications operator or its dealer',
    },
  ],
  '8.4': [
    {
      token: 'content-removal',
      defines: 'the words requiring the content to be removed, blocked or disabled',
      gloss: 'a duty to remove, block or disable access to content carried or hosted on a service',
      actor: 'the intermediary hosting or carrying the content',
    },
    {
      token: 'user-monitoring',
      defines: 'the words requiring what users do to be monitored',
      gloss: 'a duty to monitor, watch or keep track of what users do on a service',
      actor: 'the intermediary providing the service',
    },
  ],

  /* ---- Pillars 9 to 11. ---- */

  // The exception is written into the gloss because the reader is what applies it: a rule that an
  // advertisement must not mislead is consumer protection, and this indicator does not score it.
  '9.3': [
    {
      token: 'advertising-restriction',
      defines: 'the words restricting what may be advertised, to whom or in what form',
      gloss:
        'a restriction on advertising online -- what may be advertised, to whom, or in what form -- apart from a requirement that advertising not be misleading',
      actor: 'the advertiser or the platform carrying the advertisement',
    },
  ],
  '9.4': [
    {
      token: 'strict-content-licence',
      defines: 'the words letting the licence be refused or revoked, or conditioning it on the content',
      gloss:
        'a licence to provide online content, applications or platform services that may be refused, suspended or revoked at the regulator’s discretion, or that attaches conditions to the content itself',
      actor: 'the provider of the online content or application',
    },
    {
      token: 'content-licence',
      defines: 'the words requiring the licence, permit or registration',
      gloss:
        'a requirement to hold a licence, permit or registration in order to provide online content, applications or platform services',
      actor: 'the provider of the online content or application',
    },
  ],
  // Every band in this pillar reads "ICT goods or digital services" and "import" or "export", so
  // the goods are the defining element and the crossing is asked for in its own right.
  '10.1': [
    {
      token: 'ict-import-ban',
      defines:
        'the words naming the computing, telecommunications or online goods or services that may not be brought in',
      crossesBorder: true,
      gloss:
        'a prohibition on importing a class of information and communications technology goods, or on supplying an online service from abroad',
      alsoAsked: [
        'the importation of telecommunications or radiocommunications equipment is prohibited',
        'no person shall import any encryption device, computer hardware or telecommunications apparatus',
      ],
      actor: 'the importer or the foreign supplier',
    },
    // Australia scored a 1 here off consumer product safety bans and a customs detention power.
    // The reader had no way to say "a ban, and not on ICT", so it said ICT.
    {
      token: 'other-import-ban',
      defines: 'the words naming the goods that may not be brought in',
      crossesBorder: true,
      gloss:
        'a prohibition on importing goods that are not computing, telecommunications or online goods -- food, medicines, chemicals, weapons, waste, wildlife, vehicles, consumer products',
      actor: 'the importer',
    },
  ],
  '10.2': [
    {
      token: 'import-quota',
      defines:
        'the words naming the computing, telecommunications or online goods or services the limit applies to',
      crossesBorder: true,
      gloss:
        'a quota, ceiling or other limit on how much of an ICT good or online service may be imported',
      actor: 'the importer',
    },
    {
      token: 'import-compliance',
      defines:
        'the words naming the computing, telecommunications or online goods or services that may not be brought in without it',
      crossesBorder: true,
      gloss:
        'a licence, permit, authorisation, registration, labelling or import-control requirement that must be met before ICT goods or online services may be imported',
      actor: 'the importer',
    },
    {
      token: 'other-import-control',
      defines: 'the words naming the goods the control applies to',
      crossesBorder: true,
      gloss:
        'a quota, licence, permit or other import control on goods that are not computing, telecommunications or online goods',
      actor: 'the importer',
    },
  ],
  '10.4': [
    {
      token: 'ict-export-restriction',
      defines:
        'the words naming the computing, telecommunications or online goods or services that may not be sent out',
      crossesBorder: true,
      gloss:
        'a prohibition, licence, permit or other control on exporting ICT goods or supplying online services abroad',
      alsoAsked: [
        'a permit is required to export dual-use technology, cryptographic equipment or telecommunications apparatus',
      ],
      actor: 'the exporter or the supplier',
    },
    // Singapore scored a 1 here off hazardous waste, endangered species and food safety.
    {
      token: 'other-export-restriction',
      defines: 'the words naming the goods that may not be sent out',
      crossesBorder: true,
      gloss:
        'a prohibition, licence or other control on exporting goods that are not computing, telecommunications or online goods -- waste, wildlife, food, medicines, chemicals, weapons, cultural property',
      actor: 'the exporter',
    },
  ],
  '11.1': [
    {
      token: 'foreign-exclusion-from-standards',
      defines: 'the words keeping foreign persons out of the standard setting',
      gloss:
        'a rule keeping foreign persons, firms or bodies out of the process by which technical standards are set or adopted',
      actor: 'the standard-setting body or the regulator',
      actorKind: 'state',
    },
    {
      token: 'opaque-standard-setting',
      defines: 'the words letting the standard be set without publication or comment',
      gloss:
        'a rule allowing technical standards to be set, adopted or changed without publication, notice or an opportunity to comment',
      actor: 'the standard-setting body or the regulator',
      actorKind: 'state',
    },
  ],
  '11.3': [
    {
      token: 'product-testing',
      defines: 'the words requiring the product to be tested, inspected or approved',
      gloss:
        'a requirement that a product be screened, tested, inspected or type-approved before it may be sold, imported or connected to a network',
      actor: 'the supplier or importer of the product',
    },
    {
      token: 'third-party-testing-accepted',
      defines: 'the words accepting a test result or certificate from outside the economy',
      permits: true,
      gloss:
        'acceptance of test results, certificates or conformity assessments issued by a body outside the economy',
      actor: 'the regulator or certifying authority accepting the results',
    },
  ],
  '11.4': [
    {
      token: 'deviating-encryption-standard',
      defines: 'the words naming the algorithm, key length or cryptographic standard required',
      gloss:
        'a required encryption algorithm, key length or cryptographic standard set by this economy in place of an internationally agreed one',
      actor: 'the supplier or operator of the system that must use it',
    },
  ],

  /* ---- Pillars 2 to 5. Several of these bands rank on reach rather than on kind, and reach is
     already a fact every finding carries, so the vocabulary only has to name the measure. ---- */

  '2.1': [
    {
      token: 'foreign-exclusion',
      defines: 'the words excluding foreign firms from the contract',
      gloss: 'a rule that excludes foreign firms from bidding for government contracts',
      actor: 'the government body running the procurement',
    },
    {
      token: 'specific-foreign-exclusion',
      defines: 'the words naming the group of foreign firms excluded',
      gloss:
        'a rule that excludes some named group of foreign firms from government contracts, such as those from a particular country or without a local partner',
      actor: 'the government body running the procurement',
    },
  ],
  '2.2': [
    {
      token: 'surrender-source-code',
      defines: 'the words requiring the source code, patent or trade secret to be handed over',
      gloss:
        'a requirement to hand over source code, patents, algorithms or trade secrets in order to bid for or win a government contract',
      actor: 'the supplier bidding for the contract',
    },
    {
      token: 'mandated-encryption',
      defines: 'the words naming the encryption method that must be used',
      gloss: 'a requirement to use a particular encryption method or cryptographic standard in order to win a government contract',
      actor: 'the supplier bidding for the contract',
    },
  ],
  '2.3': [
    {
      token: 'foreign-bidder-discrimination',
      defines: 'the words that treat a foreign bidder worse than a local one',
      gloss:
        'a condition in government procurement that treats foreign bidders worse than local ones, such as a price preference for domestic suppliers',
      actor: 'the government body running the procurement',
    },
    {
      token: 'bidding-condition',
      defines: 'the words stating the condition every bidder must meet',
      gloss:
        'a condition on every bidder for a government contract, such as a local content share, a local employment target or another performance undertaking',
      actor: 'the supplier bidding for the contract',
    },
  ],
  '3.2': [
    {
      token: 'joint-venture',
      defines: 'the words requiring the local partner or the joint venture',
      gloss: 'a requirement that a foreign investor operate through a joint venture or in partnership with a local company',
      actor: 'the foreign investor',
    },
  ],
  '3.3': [
    {
      token: 'director-nationality',
      defines: 'the words requiring the director, manager or secretary to be a national or resident',
      appoints: true,
      actorKind: 'private',
      gloss:
        'a requirement that directors, managers or the company secretary be nationals of this economy or resident here',
      actor: 'the company appointing the directors or managers',
    },
  ],
  '3.5': [
    {
      token: 'commercial-presence',
      defines: 'the words requiring the branch, subsidiary or presence in the economy',
      gloss:
        'a requirement to establish a branch, subsidiary or other commercial presence in the economy before supplying a service to customers here',
      actor: 'the foreign supplier of the service',
    },
  ],
  // The band ranks on reach -- an entire sector or all sectors, against a single circumstance --
  // and the reader already reports reach, so both bands share one measure.
  '4.3': [
    {
      token: 'patent-enforcement-restriction',
      defines: 'the words restricting how the patent may be enforced',
      gloss:
        'a restriction on enforcing a patent, such as a compulsory licence, a limit on injunctions, a cap on damages or a bar on who may bring proceedings',
      actor: 'the patent holder seeking to enforce the patent',
    },
  ],
  '4.9': [
    {
      token: 'trade-secret-disclosure',
      defines: 'the words requiring the source code, algorithm or trade secret to be disclosed',
      gloss:
        'a requirement to disclose source code, algorithms or other trade secrets to a government body, apart from disclosure ordered to protect the public interest where the law also guards against unfair commercial use',
      actor: 'the company holding the source code or trade secret',
    },
  ],
  '4.01': [
    {
      token: 'patent-applicant-discrimination',
      defines: 'the words that treat a foreign applicant worse than a local one',
      gloss:
        'a rule in patent applications that treats foreign applicants worse than local ones, or refuses their applications on grounds that do not apply to locals',
      actor: 'the patent office deciding the application',
    },
    {
      token: 'patent-local-representative',
      defines: 'the words requiring the local agent, attorney or address for service',
      appoints: true,
      actorKind: 'private',
      gloss: 'a requirement that a patent applicant appoint a local agent, attorney or address for service in the economy',
      actor: 'the patent applicant',
    },
    {
      token: 'patent-local-filing-first',
      defines: 'the words requiring the application to be filed in the economy first',
      gloss: 'a requirement to file a patent application in this economy before filing it abroad',
      actor: 'the patent applicant',
    },
    {
      token: 'patent-substantive-examination',
      defines: 'the words requiring the application to be substantively examined',
      gloss: 'a requirement that a patent application undergo substantive examination before it is granted',
      actor: 'the patent applicant',
    },
  ],
  '5.5': [
    {
      token: 'strict-telecom-licence',
      defines: 'the words stating the strict condition the licence carries',
      gloss:
        'a licence to operate a telecommunications network or service that carries a strict condition, such as a minimum paid-up capital, a coverage or rollout obligation, or a worse condition for foreign operators',
      actor: 'the telecommunications operator applying for the licence',
    },
  ],
  // 10.3 splits on how coarsely the provision names the goods: a class of products against one
  // named product, which is what ESCAP's HS-2/HS-4 against HS-6/HS-8 means in the band text.
  '10.3': [
    {
      token: 'local-content-category',
      defines: 'the words requiring locally made goods or locally supplied services',
      gloss:
        'a requirement to use locally made goods or locally supplied services, stated for a whole sector or a broad class of goods such as telecommunications equipment',
      actor: 'the producer or supplier subject to the requirement',
    },
    {
      token: 'local-content-product',
      defines: 'the words naming the product the local inputs are required in',
      gloss:
        'a requirement to use locally made inputs in one named product, such as mobile handsets or set-top boxes',
      actor: 'the producer or supplier subject to the requirement',
    },
  ],

  /* ---- The inverted indicators. Here the measure is the protection, not the restriction, and
     its absence is the top band. Every one of them is a permission or a grant rather than a
     command, so each carries `permits` -- without it the requirement gate holds them all. ---- */

  '1.4': [
    {
      token: 'trade-defence-measure',
      defines: 'the words imposing the anti-dumping, countervailing or safeguard duty',
      permits: true,
      gloss:
        'an anti-dumping duty, countervailing duty or safeguard measure imposed on imported ICT or electronic goods',
      actor: 'the importer of the goods',
    },
  ],
  // 4.2 and 4.6 ask for the same two remedies over different rights, so the right being sued on is
  // what separates them and is the element the reader must quote.
  '4.2': [
    {
      token: 'patent-enforcement-procedure',
      defines: 'the words naming the patent, the patented invention or the patentee',
      permits: true,
      gloss:
        'a civil or administrative procedure by which a patent holder can sue for infringement of a patent and obtain a remedy such as damages, an account of profits or an injunction. Copyright is not a patent: an action over a copyright work belongs to 4.6',
      alsoAsked: [
        'proceedings for infringement of a patent may be brought by the patentee',
        'the court may grant an injunction restraining infringement of the patent',
      ],
      actor: 'the patent holder bringing the proceedings',
    },
    {
      token: 'patent-provisional-measure',
      defines: 'the words naming the patent, the patented invention or the patentee',
      permits: true,
      gloss:
        'a provisional or interim measure in a patent case, such as an interlocutory injunction, a search order or the seizure of infringing goods before trial',
      actor: 'the patent holder applying for the order',
    },
  ],
  '4.6': [
    {
      token: 'online-copyright-enforcement-procedure',
      defines: 'the words naming the copyright, the copyright work or the copyright owner',
      permits: true,
      gloss:
        'a civil or administrative procedure by which a copyright owner can sue for infringement and obtain a remedy such as damages, an account of profits or an injunction. A patent is not a copyright: an action over a patent belongs to 4.2',
      alsoAsked: [
        'an action for infringement of copyright may be brought by the owner of the copyright',
        'the court may order a network service provider to disable access to the infringing material',
      ],
      actor: 'the copyright owner bringing the proceedings',
    },
    {
      token: 'online-copyright-provisional-measure',
      defines: 'the words naming the copyright, the copyright work or the copyright owner',
      permits: true,
      gloss:
        'a provisional or interim measure in a copyright case, such as an interlocutory injunction, a blocking order or the seizure of infringing copies before trial',
      actor: 'the copyright owner applying for the order',
    },
  ],
  '4.5': [
    {
      token: 'fair-use-exception',
      defines: 'the words permitting fair use or fair dealing as an open category',
      permits: true,
      gloss:
        'a general exception to copyright for fair use or fair dealing, stated as an open category of permitted uses rather than a closed list',
      actor: 'the person using the copyright work',
    },
    {
      token: 'qualified-exception',
      defines: 'the words listing the purposes the exception is confined to',
      permits: true,
      gloss:
        'a narrow exception to copyright confined to listed purposes, or one conditioned on not conflicting with normal exploitation and not unreasonably prejudicing the rights holder',
      actor: 'the person using the copyright work',
    },
  ],
  '4.1': [
    {
      token: 'trade-secret-protection',
      defines: 'the words giving the holder a remedy for the unauthorised use or disclosure',
      permits: true,
      gloss:
        'protection for confidential business information or trade secrets, giving the holder a remedy against someone who acquires, uses or discloses it without consent',
      actor: 'the holder of the trade secret',
    },
    {
      token: 'trade-secret-clause',
      defines: 'the words imposing the duty of confidence',
      permits: true,
      gloss:
        'a single clause protecting confidential information inside a law about something else, such as a duty of confidence owed by an employee or an official',
      actor: 'the holder of the confidential information',
    },
  ],
  '5.1': [
    {
      token: 'passive-sharing-duty',
      defines: 'the words requiring the towers, ducts, poles or sites to be shared',
      gloss:
        'a duty on a telecommunications operator to share passive infrastructure -- towers, masts, ducts, poles, trenches or sites -- with another operator',
      actor: 'the operator that owns the infrastructure',
    },
  ],
  '5.4': [
    {
      token: 'accounting-separation',
      defines: 'the words requiring the separate accounts',
      gloss:
        'a duty on a telecommunications operator to keep separate accounts for different services or for wholesale and retail activities',
      actor: 'the telecommunications operator',
    },
    {
      token: 'functional-separation',
      defines: 'the words requiring the businesses to be run separately',
      gloss:
        'a duty on a telecommunications operator to run its network business as a separate unit or entity from its retail business',
      actor: 'the telecommunications operator',
    },
  ],
  '5.7': [
    {
      token: 'independent-telecom-authority',
      defines: 'the words stating the regulator acts independently or takes no direction',
      permits: true,
      gloss:
        'the establishment of a telecommunications or communications regulator, stated to act independently or not to be subject to direction in the exercise of its functions',
      actor: 'the regulator being established',
    },
  ],
  '11.2': [
    {
      token: 'sdoc-allowed',
      defines: 'the words accepting a declaration of conformity made by the supplier itself',
      permits: true,
      gloss:
        "a supplier's own declaration of conformity accepted as proof that a product meets safety, radio or electromagnetic compatibility requirements",
      actor: 'the supplier or manufacturer of the product',
    },
    {
      token: 'mra-certification-accepted',
      defines: 'the words accepting a certificate issued by a body in another country',
      permits: true,
      gloss:
        'a certificate from a conformity assessment body in another country accepted under a mutual recognition arrangement',
      actor: 'the supplier or manufacturer of the product',
    },
  ],

  /* ---- Pillar 12. The bands here ask whether a restriction exists at all, so most of these
     measures are presence tests and the vocabulary carries the whole distinction. ---- */

  // Band 1 requires both halves: a limit on what may be bought online AND one on its delivery.
  // They are separate measures so the rule can see whether both are actually present.
  '12.2': [
    {
      token: 'online-purchase-limit',
      defines: 'the words restricting what may be bought online',
      gloss: 'a restriction on which goods or services may be bought online, or on how many of them',
      actor: 'the business selling goods or services online',
    },
    {
      token: 'online-delivery-limit',
      defines: 'the words restricting delivery of what was bought online',
      gloss: 'a restriction on delivering to a buyer goods that were bought online',
      actor: 'the seller or the carrier delivering the goods',
    },
  ],
  '12.3': [
    {
      token: 'ecommerce-licence',
      defines: 'the words requiring the licence, permit or registration to sell online',
      gloss:
        'a requirement to hold a licence, permit, approval or registration in order to sell goods or services online',
      actor: 'the business selling goods or services online',
    },
  ],
  '12.4.1': [
    {
      token: 'local-bank-account',
      defines: 'the words requiring an account with a bank established in the economy',
      gloss:
        'a requirement to hold or use an account with a bank established in the economy in order to take payment',
      actor: 'the business taking the payment',
    },
  ],
  '12.4.2': [
    {
      token: 'payment-currency',
      defines: 'the words naming the currency the payment must be made in',
      gloss: 'a requirement about which currency a payment to or from another country must be made in',
      actor: 'the party making or receiving the payment',
    },
  ],
  '12.4.3': [
    {
      token: 'national-payment-standard',
      defines: 'the words naming the payment security standard this economy sets',
      gloss:
        'a standard for the security of electronic payments that this economy sets itself, rather than one adopted from an international body',
      actor: 'the payment service provider',
    },
  ],
  '12.4.4': [
    {
      token: 'payment-licence',
      defines: 'the words requiring the payment services licence',
      gloss:
        'a requirement to hold a licence to provide payment services, and the conditions that must be met to keep it',
      actor: 'the payment service provider',
    },
  ],
  '12.4.5': [
    {
      token: 'payment-ceiling',
      defines: 'the words stating the largest amount that may be paid',
      gloss:
        'a limit on the largest amount that may be paid by an electronic payment method, in one payment or over a period',
      actor: 'the payer or the payment service provider',
    },
  ],
  '12.4.6': [
    {
      token: 'mandated-intermediary',
      defines: 'the words requiring the payment to be routed through the intermediary',
      gloss:
        'a requirement to route online payments through a named or approved intermediary, switch, gateway or clearing house',
      actor: 'the payment service provider or the business taking the payment',
    },
  ],
  // The catch-all band, kept last so the reader reaches for it only when none of the six above fit.
  '12.4.7': [
    {
      token: 'other-payment-restriction',
      defines: 'the words restricting the making or receiving of the online payment',
      gloss:
        'any other restriction on making or receiving payment online, apart from ones about bank accounts, currency, security standards, licensing, maximum amounts or intermediaries',
      actor: 'the payment service provider or the business taking the payment',
    },
  ],
  // A duty actually imposed and a power to impose one are the two bands, so they are two measures.
  '12.6': [
    {
      token: 'transmission-duty',
      defines: 'the words imposing the duty or charge on the electronic delivery',
      gloss: 'a customs duty, tariff or import charge imposed on something delivered electronically',
      actor: 'the importer of the electronic transmission',
    },
    {
      token: 'transmission-duty-power',
      defines: 'the words conferring the power to impose the duty or charge',
      permits: true,
      gloss:
        'a power to impose a customs duty or import charge on goods or services delivered electronically, whether or not it has been exercised',
      actor: 'the Minister or customs authority holding the power',
    },
  ],
  '12.7': [
    {
      token: 'local-domain-or-presence',
      defines: 'the words requiring the local domain name or the presence in the economy',
      gloss:
        'a requirement to register a domain name under the top-level domain of this economy, or to be physically present here, in order to sell online',
      actor: 'the business selling goods or services online',
    },
    {
      token: 'local-representative',
      defines: 'the words naming the representative who must be in the economy',
      appoints: true,
      actorKind: 'private',
      gloss: 'a requirement to appoint a representative, agent or responsible person located in the economy',
      actor: 'the business selling goods or services online',
    },
  ],
  '12.8': [
    {
      token: 'local-presence',
      defines: 'the words requiring the provider to be established or present in the economy',
      gloss:
        'a requirement for a provider of online services to be established, incorporated, registered or physically present in the economy',
      actor: 'the provider of the online service',
    },
  ],
  /* The foreign-equity family. 3.1, 5.2 and 12.01 ask the same question of three different
     sectors, and every band names a level of ownership, so the level is the measure. */
  '3.1': [
    {
      token: 'foreign-equity-ban',
      defines: 'the words stating that a foreign person may hold no shares at all',
      permits: true,
      gloss:
        'a rule that no share of a company in a sector relevant to digital trade -- computing, data services, media, logistics, finance -- may be held by a foreign person; not telecommunications and not e-commerce, which are asked about elsewhere',
      alsoAsked: ['shares which may not be held by a foreign company or by a non-citizen'],
      actor: 'the foreign person or company that would hold the shares',
    },
    {
      token: 'foreign-equity-minority',
      defines: 'the words stating the proportion of the shares a foreign person may hold',
      permits: true,
      gloss:
        'a limit letting a foreign person hold only a minority of a company in a sector relevant to digital trade -- half the shares or fewer, however the provision phrases it, including a floor on the proportion that must be held locally',
      actor: 'the foreign person or company that would hold the shares',
    },
    {
      token: 'foreign-equity-controlling',
      defines: 'the words stating the proportion of the shares a foreign person may hold',
      permits: true,
      gloss:
        'a limit letting a foreign person hold more than half but not all of a company in a sector relevant to digital trade',
      actor: 'the foreign person or company that would hold the shares',
    },
    {
      token: 'foreign-equity-state-owned-only',
      defines: 'the words confining the limit to a company in which the State holds shares',
      permits: true,
      gloss:
        'a limit on foreign shareholding that bites only in a state-owned or government-linked company, leaving privately held companies free',
      actor: 'the foreign person or company that would hold the shares',
    },
  ],
  '5.2': [
    {
      token: 'telecom-equity-ban',
      defines: 'the words stating that a foreign person may hold no shares at all',
      permits: true,
      gloss:
        'a rule that no share of a telecommunications licensee, carrier or network operator may be held by a foreign person',
      alsoAsked: ['shares in a licensed telecommunications company which a non-citizen may not hold'],
      actor: 'the foreign person or company that would hold the shares',
    },
    {
      token: 'telecom-equity-minority',
      defines: 'the words stating the proportion of the shares a foreign person may hold',
      permits: true,
      gloss:
        'a limit letting a foreign person hold only a minority of a telecommunications licensee or carrier -- half the shares or fewer, including a floor on the proportion that must be held locally',
      actor: 'the foreign person or company that would hold the shares',
    },
    {
      token: 'telecom-equity-controlling',
      defines: 'the words stating the proportion of the shares a foreign person may hold',
      permits: true,
      gloss:
        'a limit letting a foreign person hold more than half but not all of a telecommunications licensee or carrier',
      actor: 'the foreign person or company that would hold the shares',
    },
    {
      token: 'telecom-equity-state-owned-only',
      defines: 'the words confining the limit to a company in which the State holds shares',
      permits: true,
      gloss:
        'a limit on foreign shareholding in telecommunications that bites only in a state-owned or government-linked operator',
      actor: 'the foreign person or company that would hold the shares',
    },
  ],
  '12.01': [
    {
      token: 'ecommerce-equity-ban',
      defines: 'the words stating that a foreign person may hold no shares at all',
      permits: true,
      gloss:
        'a rule that no share of a company selling goods or services online, or operating an online marketplace, may be held by a foreign person',
      actor: 'the foreign person or company that would hold the shares',
    },
    {
      token: 'ecommerce-equity-minority',
      defines: 'the words stating the proportion of the shares a foreign person may hold',
      permits: true,
      gloss:
        'a limit letting a foreign person hold only a minority of a company selling online or operating an online marketplace -- half the shares or fewer, including a floor on the proportion that must be held locally',
      actor: 'the foreign person or company that would hold the shares',
    },
    {
      token: 'ecommerce-equity-controlling',
      defines: 'the words stating the proportion of the shares a foreign person may hold',
      permits: true,
      gloss:
        'a limit letting a foreign person hold more than half but not all of a company selling online or operating an online marketplace',
      actor: 'the foreign person or company that would hold the shares',
    },
  ],
  '12.5': [
    {
      token: 'de-minimis-threshold',
      defines: 'the words stating the value below which the duty or tax is not charged',
      permits: true,
      gloss:
        'a value of imported goods below which no customs duty, import duty or import tax is charged, however the provision names it -- a de minimis, a relief, an exemption by value, a threshold for informal clearance',
      alsoAsked: ['goods of a value not exceeding a stated amount are exempt from import duty or sales tax'],
      actor: 'the importer of the goods',
    },
  ],
  '3.4': [
    {
      token: 'investment-screening',
      defines: 'the words naming the approval, notification or clearance the investment must go through',
      permits: true,
      gloss:
        'a mechanism under which a foreign investment or an acquisition of a business must be notified to, approved by or cleared with an authority before it may proceed; not ordinary competition-law merger review, which this indicator excludes',
      alsoAsked: ['approval of the Minister required before a foreign person acquires an interest in a business'],
      actor: 'the authority that screens the investment, and the investor who must seek its clearance',
    },
    {
      token: 'discriminatory-merger-review',
      defines: 'the words by which the review applies to a foreign party and not to a local one',
      permits: true,
      gloss:
        'a merger or acquisition review that treats a foreign acquirer differently from a local one; ordinary anti-trust review applying alike to both is not this measure',
      actor: 'the authority that reviews the acquisition',
    },
  ],
  '9.1': [
    {
      token: 'content-blocking',
      defines: 'the words naming the site, service or content that may be made inaccessible',
      permits: true,
      gloss:
        'a power or duty to block access to a commercial website, online service or online content -- an ordinary trading site, a marketplace, an advertisement, a streaming or gambling service. Not political content, not criminal content such as child abuse material, not age-restricted content and not defamation, none of which this indicator scores',
      alsoAsked: ['a direction to an internet service provider to disable access to a website'],
      actor: 'the authority issuing the direction, and the service provider that must carry it out',
    },
    {
      token: 'content-filtering',
      defines: 'the words naming the content that must be screened, restricted or filtered',
      permits: true,
      gloss:
        'a power or duty to filter, screen or restrict access to a class of commercial online content without blocking a site outright. Not political, criminal, age-restricted or defamatory content, which this indicator does not score',
      actor: 'the authority requiring the filtering, and the service provider that must apply it',
    },
  ],
};

/**
 * Which indicator a measure belongs to, where it belongs to only one.
 *
 * The measure is drawn from the provision; the indicator is a filing decision the reader makes
 * twenty fields later, and it is the one it gets wrong. Every token is owned outright, so the
 * measure settles the indicator and the reader's guess is spare.
 */
export const INDICATOR_OF_MEASURE: ReadonlyMap<string, string> = (() => {
  const owners = new Map<string, string[]>();
  for (const [indicatorId, measures] of Object.entries(MEASURES)) {
    for (const m of measures) owners.set(m.token, [...(owners.get(m.token) ?? []), indicatorId]);
  }
  const sole = new Map<string, string>();
  for (const [token, ids] of owners) if (ids.length === 1 && ids[0]) sole.set(token, ids[0]);
  return sole;
})();
