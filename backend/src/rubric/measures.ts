import { availableProfiles, loadProfile } from '../profile/index.js';

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
  /**
   * Whether only a command makes this measure out, so that a prohibition does not.
   * A duty not to disclose a trade secret was making out 4.9's duty to disclose one.
   */
  commands?: boolean;
  /**
   * Whether this measure is deliberately about something other than the indicator's subject.
   *
   * Three indicators carry a catch-all beside the real measure -- an import ban on food or
   * firearms recorded as what it is, rather than as an ICT ban. Those exist to say "a ban, and not
   * on this", so the subject test would hold exactly the findings they were written to keep.
   */
  offSubject?: boolean;
  /**
   * Whether the defining words must say more than where the data goes.
   *
   * 6.4 asks for a condition, and "overseas" is not one. The reader answered the condition question
   * with the place words, which made the check free to pass and let asset transfers score.
   */
  distinctFromPlace?: boolean;
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
      defines:
        'the words stating what has to be satisfied before the data may go -- an "unless", an ' +
        '"only if", a "before ... must", or the standard the recipient has to meet. Naming the ' +
        'place the data goes, or the word "conditions" on its own, states no condition',
      crossesBorder: true,
      distinctFromPlace: true,
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
      // Any act that establishes who the subscriber is before service, not only recording it: the
      // instruments that impose this say "verify" or "confirm", and a confirmation pass reading
      // "recorded" literally refused every one of them.
      defines: 'the words requiring the subscriber identity to be established -- recorded, verified or confirmed -- before service',
      gloss:
        'a requirement to record, verify or confirm the identity of the person a SIM card or mobile subscription is issued to, before the service is provided',
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
      defines: 'the words prohibiting the goods or services from being brought in',
      crossesBorder: true,
      gloss:
        'a prohibition on importing a class of information and communications technology goods, or on supplying an online service from abroad. A ban on food, medicines, chemicals, weapons, waste, wildlife, vehicles or consumer products is a real import ban and belongs to other-import-ban',
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
      offSubject: true,
      alsoAsked: [
        'the Minister may impose a permanent ban on consumer goods of a particular kind',
        'a person commits an offence if the person imports a firearm or firearm part',
      ],
      gloss:
        'a prohibition on importing goods that are not computing, telecommunications or online goods -- food, medicines, chemicals, weapons, waste, wildlife, vehicles, consumer products',
      actor: 'the importer',
    },
  ],
  '10.2': [
    {
      token: 'import-quota',
      defines: 'the words setting the limit on how much may be brought in',
      permits: true,
      crossesBorder: true,
      gloss:
        'a quota, ceiling or other limit on how much of an ICT good or online service may be imported',
      actor: 'the importer',
    },
    {
      token: 'import-compliance',
      defines: 'the words requiring the licence, permit, registration or label before it may be brought in',
      crossesBorder: true,
      gloss:
        'a licence, permit, authorisation, registration, labelling or import-control requirement that must be met before ICT goods or online services may be imported',
      actor: 'the importer',
    },
    {
      token: 'other-import-control',
      defines: 'the words naming the goods the control applies to',
      crossesBorder: true,
      offSubject: true,
      gloss:
        'a quota, licence, permit or other import control on goods that are not computing, telecommunications or online goods',
      actor: 'the importer',
    },
  ],
  '10.4': [
    {
      token: 'ict-export-restriction',
      defines: 'the words prohibiting or controlling the sending out of the goods or services',
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
      offSubject: true,
      alsoAsked: [
        'no person shall export hazardous or other waste except under a permit',
        'a licence is required to export any scheduled species',
      ],
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
      // Reader-side, so it takes effect at the next run: batch it. The question used to ask which
      // algorithm was required, and the deciding word in this measure is not "algorithm" but
      // "deviating". Asked the old way Malaysia answered with a code-of-practice checklist row
      // reading "Encryption (if required)" -- a topic, not a standard -- and Australia with
      // "approved by the Australian Signals Directorate", which names a real national authority
      // whose approved list is the international algorithms. Neither departs from anything. A gate
      // that asked for an algorithm name refused both, and refused the second wrongly: it does name
      // a standard. Departure is the thing to ask for, and only the reader can see it.
      defines: 'the words showing the required encryption departs from the internationally agreed standard',
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
      commands: true,
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
      defines:
        'the words naming the patent, the patented invention or the patentee, together with the ' +
        'limit placed on enforcing it. A design, a copyright work or property at large is not a patent',
      gloss:
        'a restriction on enforcing a patent, such as a compulsory licence, a limit on injunctions, a cap on damages or a bar on who may bring proceedings',
      actor: 'the patent holder seeking to enforce the patent',
    },
  ],
  '4.9': [
    {
      token: 'trade-secret-disclosure',
      defines: 'the words requiring the source code, algorithm or trade secret to be disclosed',
      commands: true,
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
      gloss:
        'an anti-dumping duty, countervailing duty or safeguard measure imposed on imported ICT or electronic goods',
      actor: 'the importer of the goods',
      // A duty is charged on whoever brings the goods in. Every finding this indicator collected in
      // all three economies binds the Minister, the Government or the court instead -- the sections
      // of the enabling Act that say when and how a duty may be imposed, which are the procedure
      // and not the measure. ESCAP answers this one from a register of measures actually in force,
      // so an Act read as four of them is the reading to stop, not the register to reproduce.
      actorKind: 'private',
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
      // Open or confined is a question of drafting, not of name: "fair dealing" is usually a closed
      // list of purposes, and reading the name split one provision between the two measures.
      defines: 'the words letting any use be weighed against stated factors, whatever the statute calls the exception',
      permits: true,
      gloss:
        'a general exception to copyright under which any use may qualify when weighed against stated factors -- the purpose and character of the use, the nature of the work, the amount used, the effect on the market -- rather than only uses for listed purposes',
      actor: 'the person using the copyright work',
    },
    {
      token: 'qualified-exception',
      defines: 'the words listing the purposes the exception is confined to, whatever the statute calls the exception',
      permits: true,
      gloss:
        'an exception to copyright confined to named purposes -- research, criticism, review, news reporting -- including fair dealing for those purposes, or one conditioned on not conflicting with normal exploitation and not unreasonably prejudicing the rights holder',
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
      permits: true,
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
      // A de minimis is a threshold on goods arriving, and the gloss below has said so all along
      // without anything enforcing it. Every tax act states thresholds, and a threshold read off
      // one of them decided this cell on a wine tax credit the Commissioner "is not required to
      // consider" -- a real figure, in a real revenue statute, with nothing crossing a border.
      crossesBorder: true,
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

/**
 * What a provision has to be about, indicator by indicator.
 *
 * Every field above asks what a provision *does* -- who is bound, what they must do, where, by
 * what words. Nothing asked what it was *about*, and across the twelve-pillar run that is what
 * went wrong most often. Malaysia's online-payment cell scored its maximum on "The Commission
 * shall open and maintain an account or accounts with such bank or banks in Malaysia", which is
 * the Competition Commission's housekeeping. Its e-commerce licensing cell scored on licences from
 * the Kenaf and Tobacco Board and the solid waste regulator. Australia's ICT import ban scored on
 * consumer product safety. Every one of those provisions genuinely imposes the act the measure
 * describes. None of them is about the thing the indicator asks about.
 *
 * So the subject is asked the way the place and the role are asked: as words copied out of the
 * provision, absent when the provision does not name it. The Kenaf Act names no online selling, a
 * commission's bank account names no online payment, and a ban on consumer goods names no ICT
 * good -- not because a list says those Acts are irrelevant, but because the words are not there.
 *
 * The subject is the indicator's, not the measure's: every measure of an indicator is about the
 * same thing, which is what the rubric's "Category (Policy issue)" column says.
 *
 * Pillars 6 and 7 are deliberately absent. Their subject is already asked for and checked three
 * ways -- the data located, the words calling it information, the words keeping it there -- and a
 * second question about the same thing would only be answered with the same words.
 */
export const SUBJECTS: Readonly<Record<string, string>> = {
  '1.4': 'the imported goods the anti-dumping, countervailing or safeguard duty is charged on',
  '2.1': 'the government procurement, tender or public contract the exclusion applies to',
  '2.2': 'the source code, encryption or trade secret that has to be surrendered or used',
  '2.3': 'the government procurement, tender or public contract the limitation applies to',
  '3.1': 'the sector or line of business whose shares are restricted',
  '3.2': 'the business or sector the joint venture has to be formed in',
  '3.3': 'the company or the office whose holder has to be a national or a resident',
  '3.4': 'the investment or acquisition that has to be screened or approved',
  '3.5': 'the service that may only be supplied through a presence in the economy',
  '4.01': 'the patent or the patent application',
  '4.2': 'the patent whose infringement is being remedied',
  '4.3': 'the patent whose infringement is being remedied',
  '4.5': 'the copyright work, or the right in it',
  '4.6': 'the copyright work infringed online, or the right in it',
  '4.9': 'the trade secret, source code or algorithm that has to be disclosed',
  '4.1': 'the trade secret or confidential business information being protected',
  '5.1': 'the telecommunications infrastructure that has to be shared',
  '5.2': 'the telecommunications business whose shares are restricted',
  '5.4': 'the telecommunications operator that has to separate its accounts or its functions',
  '5.5': 'the telecommunications service, network or operator the licence is required for',
  '5.7': 'the telecommunications regulator whose independence is in question',
  '8.3': 'the user or subscriber of the online or telecommunications service who has to be identified',
  '8.4': 'the online content, or the service carrying it, that has to be monitored',
  '9.1': 'the website, online content or application that is to be blocked or filtered',
  '9.3': 'the advertising, and the fact that it is carried online',
  '9.4': 'the online content provider, platform or application the licence is required for',
  '10.1': 'the computing, telecommunications or online goods or services that may not be brought in',
  '10.2': 'the computing, telecommunications or online goods or services the restriction applies to',
  '10.3': 'the goods, services or content the local-content requirement applies to',
  '10.4': 'the computing, telecommunications or online goods or services that may not be sent out',
  '11.1': 'the technical standard or technical regulation being set',
  '11.2': 'the product whose safety or radio emissions have to be certified',
  '11.3': 'the product that has to be screened, tested or certified',
  '11.4': 'the encryption standard or cryptographic method',
  '12.01': 'the e-commerce business or online marketplace whose shares are restricted',
  '12.2': 'the online purchase, or the delivery of what was bought online',
  '12.3': 'the online selling or e-commerce service the licence is required for',
  '12.4.1': 'the online payment, or the online purchase the payment is for',
  '12.4.2': 'the online payment, or the online purchase the payment is for',
  '12.4.3': 'the online payment, or the online purchase the payment is for',
  '12.4.4': 'the online payment, or the online purchase the payment is for',
  '12.4.5': 'the online payment, or the online purchase the payment is for',
  '12.4.6': 'the online payment, or the online purchase the payment is for',
  '12.4.7': 'the online payment, or the online purchase the payment is for',
  '12.5': 'the imported consignment or its value, which the threshold is applied to',
  '12.6': 'the electronic transmission the duty or charge is imposed on',
  '12.7': 'the domain name',
  '12.8': 'the online service whose provider has to be present in the economy',
};

/**
 * The words that place a subject in the domain an indicator asks about.
 *
 * SUBJECTS asks the reader to name what the provision is about, and the reading prompt tells it to
 * answer null where the provision names no such thing, with this exact case spelled out: "A licence
 * is not an e-commerce licence unless the provision says what is being licensed and the answer is
 * selling online." The reader answers "bank" anyway, and "licence", and "note, coin" -- real
 * subjects, copied from the provision, belonging to another world. A broadcasting licence and an
 * auctioneer's commission both scored the e-commerce licensing cell that way.
 *
 * So the answer is checked against the question. Not a list of the instruments we do not want: a
 * statement of what a subject has to say to be the one asked for, in the words a provision uses to
 * say it. A subject saying none of them has not been shown, whatever it names.
 */
const ONLINE = /\b(online|on-line|internet|e-?commerce|e-?business|e-?retail|electronic|digital|web|website|cyber|computer|network|platform|marketplace|application|app|software|data|mobile)\b/i;

/**
 * 12.4 asks what limits paying for something online, and ESCAP answers it with the payment
 * instrument rather than the word "online": a purchased payment facility for Australia, electronic
 * money for Malaysia, the Payment Services Act for Singapore. A limit on the instrument is a limit
 * on paying with it, so the instrument names the domain. The nouns are payment's own, so a sum
 * payable to the World Bank and a rule on minting legal tender still name neither.
 */
const PAYMENT = new RegExp(
  [
    ONLINE.source,
    /\bpayment\s+(service|system|facility|instrument|account|card|gateway|method|surcharge|order)/.source,
    /\b(e-?money|stored[- ]value|digital currency|crypto\w*|virtual asset|funds transfer|money transfer|remittance|non-?cash payment|wallet|credit card|debit card)s?\b/.source,
  ].join('|'),
  'i',
);

/** 12.7 asks about the domain name itself, which is narrower than the pillar around it. */
const DOMAIN_NAME = /\b(domain|url|website|web address|hostname|dns|registrar|registry)\b/i;

const PILLAR_12_DOMAINS: Readonly<Record<string, RegExp>> = {
  '12.01': ONLINE,
  '12.2': ONLINE,
  '12.3': ONLINE,
  '12.4.1': PAYMENT,
  '12.4.2': PAYMENT,
  '12.4.3': PAYMENT,
  '12.4.4': PAYMENT,
  '12.4.5': PAYMENT,
  '12.4.6': PAYMENT,
  '12.4.7': PAYMENT,
  '12.6': ONLINE,
  '12.7': new RegExp([DOMAIN_NAME.source, ONLINE.source].join('|'), 'i'),
  '12.8': ONLINE,
};

/**
 * The word a provision has to use to be a given measure, where the measure is named by one.
 *
 * `defines` already says what a provision must state, and the reader copies those words out. What
 * nothing asked was whether the words it copied say the thing at all. Australia's e-commerce
 * licensing cell was decided by "The Commissioner must develop an APP code", filed as a licence to
 * sell online; its online-content licensing cell by "keep a copy of any contracts". An APP code is
 * not a licence and a contract is not a licence, and neither provision uses a word that means one.
 *
 * So this is not a list of instruments we do not want, and not a judgement about whether a reading
 * is a good one. It is the measure's own name: a licensing measure is made out by a word meaning
 * licence, a retention period by a word meaning time, a duty on imports by a word meaning duty.
 * A measure whose word is absent has not been shown, which is a finding about the provision and
 * is recorded as one.
 *
 * Only measures named by a legal term of art appear here. A measure whose name is a description
 * rather than a term -- "other restriction on paying online" -- has no such word and gets none.
 */
const LICENCE = /\b(licen[cs]\w*|permit\w*|registrat\w*|register\w*|approval|authoris\w*|authoriz\w*|certificat\w*|accredit\w*)\b/i;
const DUTY_OR_TAX = /\b(dut(y|ies)|tax\w*|tariff\w*|levy|levies|excise|customs charge|charge\w*)\b/i;
const PERIOD = /\b(year|month|day|week|period|时|\d+\s*(year|month|day|week))\w*\b/i;
const AMOUNT = /(\d|\bquota\b|\bceiling\b|\blimit\b|\bmaximum\b|\bexceed\b|\bnot more than\b)/i;
const STANDARD = /\b(standard\w*|specification\w*|technical regulation\w*|conform\w*|compliance)\b/i;
const TESTING = /\b(test\w*|assess\w*|certif\w*|verif\w*|examin\w*|inspect\w*|accredit\w*|conformity)\b/i;
const ENCRYPTION = /\b(encrypt\w*|cryptograph\w*|cipher\w*|key length|AES|DES|RSA|ECC|FIPS)\b/i;
const NATIONALITY = /\b(citizen\w*|national(ity|s)?\b|resident\w*|domicil\w*|permanent resident)\b/i;
const TRADE_DEFENCE = /\b(dump\w*|countervail\w*|safeguard\w*|subsid\w*|injur\w*)\b/i;
const SEPARATION = /\b(separat\w*|divest\w*|structural\w*|unbundl\w*|account\w*|divid\w*)\b/i;
const JOINT_VENTURE = /\b(joint venture\w*|partner\w*|local equity|incorporat\w*|jointly)\b/i;
/**
 * Where a thing has to be, in the words a system uses for its own territory.
 *
 * Half of it is the relation -- local, domestic, onshore, established or incorporated here -- which
 * no legal system can word its own way. The other half is that a statute usually just says the
 * place: "such bank or banks in Malaysia". Both halves are needed, and the second was typed in as
 * Malaysia, Singapore and Australia, which is a fact about the corpus rather than about the
 * indicator and works on no fourth economy.
 *
 * So the names come from the profiles instead. `data/profiles/*.json` is where an economy is
 * declared, and adding one there now extends this by construction. Failing to read a profile costs
 * that economy's name and nothing else, so a half-written profile does not take the rubric down.
 */
const ECONOMY_NAMES = availableProfiles()
  .map((code) => {
    try {
      return loadProfile(code).name;
    } catch {
      return null;
    }
  })
  .filter((n): n is string => !!n && /^[A-Za-z ]+$/.test(n));

const LOCALITY = new RegExp(
  `\\b(local\\w*|domestic\\w*|onshore|in the (?:economy|country|State)|established in|incorporated in|resident\\w*` +
    (ECONOMY_NAMES.length ? `|${ECONOMY_NAMES.map((n) => `${n}n?`).join('|')}` : '') +
    `)\\b`,
  'i',
);

const IDENTITY = /\b(identit\w*|identif\w*|authenticat\w*|verif\w*|know your customer|kyc|proof of (?:name|age|address))\b/i;

/**
 * A measure defined by what a rule lets happen *without* is named by the absence, not by the topic.
 *
 * 11.1's top band is "standards set, adopted or changed without publication, notice or an
 * opportunity to comment". Every word naming the topic also appears in a rule mandating the
 * opposite, so topic is no test at all: section 132 of Australia's Telecommunications Act, headed
 * "Public consultation on industry standards", was filed as opaque standard-setting on the words
 * "free copies of the draft will be made available to members of the public" -- a transparency
 * duty read as its own negation. Singapore's accounting-standards objects clause went the same way
 * on "must have the following objects". ESCAP scores both economies 0.
 *
 * So what a provision must say to be this measure is that the publicity need not happen. That is
 * the measure's own definition and not a list of instruments to exclude, and a provision that
 * publishes, consults or invites comment fails it on the very words it was cited for.
 */
const WITHOUT_PUBLICITY = new RegExp(
  [
    /\b(without|absent|other than|need not|not (?:be )?(?:required|obliged|necessary)|no (?:requirement|obligation|need|notice)|exempt\w*|dispens\w*|waiv\w*)\b/.source,
    /\b(confidential\w*|secret\w*|closed|in camera|unpublished)\b/.source,
  ].join('|'),
  'i',
);

/**
 * A measure defined as a restriction has to be made out by words that restrict something.
 *
 * 12.4.7 is the residual band of pillar 12's payment group -- "any other restriction on making or
 * receiving payment online" -- and it was answered 1 in all three economies where ESCAP answers 0.
 * Every one of the six provisions it rested on was made out on a noun phrase. Malaysia's Online
 * Safety Act was read on a seizure power's list of seizable things, "Any book, account, document,
 * computerized data, signboard, card, letter, pamphlet, leaflet, notice, facility, apparatus,
 * equipment, device, thing or matter"; its Price Control Act on a production power's "any
 * information (including, but not limited to, records, accounts and computerized data)"; Singapore
 * on "electronic transaction system" and on "information or material"; Australia on the single
 * adjective "excessive". A catch-all with no term of art to ask for will take anything, and what it
 * took was the enforcement machinery of acts that mention accounts and cards in passing.
 *
 * So ask for the only thing every restriction has in common: a word that does the restricting. The
 * lookbehind is not decoration -- "including, but not limited to" is drafting boilerplate that
 * appears in exactly the production powers this is meant to exclude, and matching "limited" there
 * would readmit them.
 */
const RESTRICTION = new RegExp(
  [
    /\b(prohibit\w*|forbid\w*|ban(?:s|ned|ning)?|restrict\w*|(?<!not\s)limit\w*|cap(?:s|ped|ping)?)\b/.source,
    /\b(?:shall|must|may|can)\s+not\b|\bnot\s+(?:be\s+)?(?:permit\w*|allow\w*|entitled)\b/.source,
    /\b(no person|nobody|only|unless|except (?:with|where|if)|subject to)\b/.source,
    /\b(requir\w*|oblig\w*|mandat\w*|condition(?:al|ed)? (?:on|upon))\b/.source,
  ].join('|'),
  'i',
);

/**
 * A list of algorithm names was tried here for 'deviating-encryption-standard' and removed.
 *
 * It was worth a cell and it was wrong. Auditing every gate by what it threw out across the three
 * economies, that one fired four times in two cells, and one of the four was Australia's "approved
 * by the Australian Signals Directorate" -- refused for naming no cryptographic standard, when the
 * ASD list is exactly that. The cell still scored what ESCAP scores, by the wrong route.
 *
 * The general shape: a closed list of the specific things that exist rejects the real provision
 * that names a thing not on it, and there is no list of every cryptographic authority on earth. A
 * category any legal system would have words for is safe; an enumeration of the ones in our corpus
 * is a fact about the corpus. What the measure actually turns on is departure from the
 * international standard, which is a question about meaning, so it is asked of the reader in
 * `defines` instead. See the note on LOCALITY, which lost the economy names for the same reason.
 */
export const MEASURE_NAMES: Readonly<Record<string, RegExp>> = {
  // A licence measure needs a word meaning licence. Five indicators turn on one.
  'content-licence': LICENCE,
  'strict-content-licence': LICENCE,
  'ecommerce-licence': LICENCE,
  'payment-licence': LICENCE,
  'strict-telecom-licence': LICENCE,
  'import-quota': AMOUNT,
  'import-compliance': /\b(comply|complian\w*|conform\w*|requirement\w*|standard\w*|licen[cs]\w*|permit\w*|approval)\b/i,
  // A period measure needs a period. The two amount measures are deliberately absent: a threshold
  // whose figure we could not read is still a threshold, and is already held rather than ruled out.
  'minimum-retention': PERIOD,
  'maximum-retention': PERIOD,
  // Standards, testing and encryption are each named by their own term of art.
  'deviating-encryption-standard': ENCRYPTION,
  'mandated-encryption': ENCRYPTION,
  'product-testing': TESTING,
  'third-party-testing-accepted': TESTING,
  'sdoc-allowed': /\b(self[- ]declar\w*|declaration of conformity|supplier'?s? declaration)\b/i,
  'mra-certification-accepted': /\b(mutual recognition|foreign\w*|overseas|another (country|economy|jurisdiction)|recognis\w*|recogniz\w*)\b/i,
  'foreign-exclusion-from-standards': /\b(foreign\w*|non-?resident\w*|overseas|nationa\w*)\b/i,
  'national-payment-standard': STANDARD,
  // Named by its negation rather than by a term of art: see WITHOUT_PUBLICITY above.
  'opaque-standard-setting': WITHOUT_PUBLICITY,
  // A residual band with no term of art to ask for: see RESTRICTION above.
  'other-payment-restriction': RESTRICTION,
  // 12.2's two measures say "restricting" in their own `defines` as well.
  'online-purchase-limit': RESTRICTION,
  'online-delivery-limit': RESTRICTION,
  // Duties on transmission are duties; a trade defence measure names its own instrument.
  'transmission-duty': DUTY_OR_TAX,
  'transmission-duty-power': DUTY_OR_TAX,
  'trade-defence-measure': TRADE_DEFENCE,
  // Presence, nationality and structure.
  'director-nationality': NATIONALITY,
  'joint-venture': JOINT_VENTURE,
  'accounting-separation': SEPARATION,
  'functional-separation': SEPARATION,
  // Named by the half of it that is a term of art, which is the local half and not the bank. Its
  // own `defines` asks for "an account with a bank established in the economy", and asking only
  // for a word meaning bank let section 137 of Malaysia's Islamic Financial Services Act decide
  // the cell: a takaful broker must hold client money "in a licensed Islamic bank separate from
  // its own account". That is client-money segregation, which every one of these systems requires
  // and none of them counts as a localisation rule, and the words never say where the bank is.
  'local-bank-account': LOCALITY,
  'local-representative': /\b(represent\w*|agent\w*|office\w*|establish\w*|resident\w*)\b/i,
  'local-presence': /\b(present\w*|establish\w*|office\w*|branch\w*|subsidiar\w*|incorporat\w*|resident\w*)\b/i,
  'local-domain-or-presence': /\b(domain\w*|present\w*|establish\w*|office\w*|branch\w*|subsidiar\w*|incorporat\w*)\b/i,
  // The officer measure is a person put in a position, and the role words already carry that.
  // Pillar 8's two identity measures are named by identity, and were not asked for it. The top
  // band took a customs declaration for imported timber, a duty to keep a record of "personal
  // data", and a university rule about staff asking for proof of ID; the 0.5 band was asked for a
  // word meaning licence, which is what a SIM rule is least likely to say -- it says the
  // subscriber's identity must be recorded. So the top band admitted provisions that identify
  // nobody while the band below it turned away the ones that do, and all three economies scored
  // the top band where ESCAP scores the one under it.
  'user-identity': IDENTITY,
  'sim-registration': IDENTITY,
  'patent-local-representative': /\b(represent\w*|agent\w*|attorney\w*|address for service)\b/i,
};

/**
 * The domains for indicators whose subject is a term of art rather than a sector.
 *
 * Thirteen indicators had this check and forty-eight did not, so a provision could be about
 * anything and still answer them as long as it named something: a broadcasting licence answered
 * the telecom licensing cell, and anti-dumping duty on goods generally answered the ICT-goods one.
 *
 * Writing a domain for each of the forty-eight was tried and measured, and it does not work. A
 * domain is a list of the words a subject must use, and a sector is worded differently in every
 * legal system: Malaysia's online content services are "content applications services", Australia's
 * telecommunications operators are "carriage service providers", and a list that recognises one
 * jurisdiction's phrase rules out the other's real findings. Across the twelve-pillar run the full
 * set won thirteen cells and lost fourteen, and each regex fitted to recover a loss is a word list
 * shaped by the answer key rather than by the indicator.
 *
 * So the domains kept are the ones a legal system cannot word its own way. A patent is a patent, a
 * copyright a copyright, a trade secret a trade secret, and an encryption standard names the
 * standard. Telling a broadcasting service from a telecommunications one is a question about the
 * provision in its own vocabulary, which is a reader's question and not a word list's.
 *
 * Pillars 6 and 7 stay out, as they do in SUBJECTS: their subject is already asked for three ways
 * -- the data located, the words calling it information, the words keeping it there.
 */
const ICT_GOODS = new RegExp(
  [
    ONLINE.source,
    /\b(ict|telecom\w*|radiocommunication\w*|semiconductor\w*|hardware|server\w*|handset\w*|equipment|device\w*|component\w*|circuit\w*|encryption|technolog\w*|information technology)\b/.source,
  ].join('|'),
  'i',
);
const PROCUREMENT = /\b(procure\w*|tender\w*|bid\w*|public contract\w*|government contract\w*|supply to the (Government|State)|Commonwealth contract\w*|purchas\w* by (a|the) (public|government)\w*)\b/i;
const SECRETS = /\b(trade secret\w*|source code\w*|algorithm\w*|confidential (business )?information|proprietary information|encrypt\w*|cryptograph\w*|know-how)\b/i;
const PATENT = /\b(patent\w*|invention\w*|utility model\w*|patentee\w*)\b/i;
const COPYRIGHT = /\b(copyright\w*|author\w*|literary|artistic|musical|cinematograph\w*|performer\w*|work\w*|broadcast\w*|infring\w*)\b/i;
const TELECOM = new RegExp(
  [
    /\b(telecom\w*|telephon\w*|carrier\w*|carriage service\w*|network service\w*|spectrum|radiocommunication\w*|licensee\w*|operator\w*|subscriber\w*|broadband|mobile)\b/.source,
    ONLINE.source,
  ].join('|'),
  'i',
);
const INVESTMENT = /\b(invest\w*|acquisi\w*|acquire\w*|takeover\w*|merger\w*|shareholding\w*|share\w*|stake\w*|interest in|control\w*|entit\w*|business\w*|compan\w*|asset\w*|undertaking\w*)\b/i;
const DIGITAL_SECTOR = new RegExp([ONLINE.source, TELECOM.source, /\b(sector\w*|industry|business\w*|service\w*)\b/.source].join('|'), 'i');
const ADVERTISING = new RegExp([/\b(advertis\w*|promotion\w*|marketing|sponsor\w*)\b/.source, ONLINE.source].join('|'), 'i');
const PRODUCT_CERT = /\b(product\w*|goods|equipment|device\w*|apparatus|appliance\w*|radiocommunication\w*|emission\w*|electromagnetic|safety|conformity|standard\w*)\b/i;
const TECHNICAL_STANDARD = /\b(standard\w*|specification\w*|technical regulation\w*|code of practice|conformity)\b/i;
const CUSTOMS = /\b(import\w*|consign\w*|customs|duty|duties|goods|parcel\w*|shipment\w*|value of the goods|declaration\w*)\b/i;

/**
 * What a provision has to be *about* to be a given measure, where the indicator's own subject is
 * wider than the measure's.
 *
 * SUBJECT_DOMAIN asks this of the indicator, which is the right question wherever an indicator's
 * bands are rungs of one ladder. 8.3's are not: its top band is identity to reach the internet and
 * the band below it identity for a SIM, and those are two subjects, not two heights of one. Given
 * a single domain the two measures are made out by the same words, so a mobile number-porting
 * check answered the internet question and every economy scored the top band where ESCAP scores
 * the one beneath -- Australia on its pre-porting determination, Singapore on an end-user notice,
 * Malaysia on a shelter's duty to "record the attendance of each inmate".
 *
 * So where a measure's subject is narrower than its indicator's, it says so here, and this is
 * asked instead of the indicator's. Everything SUBJECT_DOMAIN's own note says still holds: these
 * are the subjects a legal system cannot word its own way, and a measure whose subject is a sector
 * gets none.
 */
const ONLINE_SERVICE = /\b(internet|online|on-line|web\w*|cyber\w*|e-?commerce|digital (?:service|platform|identity)\w*|platform\w*|social media|search engine\w*|end-?users?)\b/i;
const MOBILE_SUBSCRIPTION =
  /\b(SIM\b|SIM cards?|pre-?paid|cellular|mobile\w*|carriage service\w*|telephon\w*|subscriber\w*|number portab\w*|porting)\b/i;

/**
 * What a licence has to be a licence *for*, where the indicator asks about licensing one trade.
 *
 * "Online" alone cannot carry a licensing question, because everything a modern economy regulates
 * now happens online: a licence to run a network, to provide a digital token service, to publish
 * content. Each is held by a business that trades online, and none of them is a licence to trade.
 * The indicator's own exception says as much -- licences for other aspects of the business "are not
 * captured" -- and its measure asks for the licence held "in order to sell goods or services
 * online".
 *
 * So the subject has to name the commerce as well as the channel. One economy's cell was decided by
 * "network facilities or network service or applications service" and another's by "providing any
 * type of digital token service"; both name a regulated activity, neither names a sale. What
 * survives is what the words describe: an online marketplace, a supply of goods through a website,
 * an e-commerce service.
 */
const TRADE =
  /\b(sell\w*|sale|sales|sold|buy\w*|purchas\w*|retail\w*|wholesal\w*|trad(e|er|ers|ing)|commerc\w*|market(place|ing)?|merchant\w*|vendor\w*|supply|supplying|suppliers?|goods|distributive)\b/i;

/** Both halves, in either order: it has to be trade, and it has to be trade done online. */
const ONLINE_TRADE = new RegExp(`(?=.*${TRADE.source})(?=.*${ONLINE.source})`, 'i');

export const MEASURE_DOMAIN: Readonly<Record<string, RegExp>> = {
  // 8.3's two bands are two subjects: identity to reach a service online, and identity for the
  // mobile subscription the service runs over. Only the top band gets a domain. The band below it
  // is carried by its instrument -- Australia's pre-porting determination says "mobile" in its
  // title and then never again -- and a domain asked of the words would turn away the very
  // findings ESCAP scores. A topic is carried by the document; only the narrower band has to say
  // it in the sentence.
  'user-identity': ONLINE_SERVICE,
  // A licence to sell online is narrower than its indicator's "online", for the reason
  // ONLINE_TRADE gives: online is where the business operates, not what it is licensed to do.
  'ecommerce-licence': ONLINE_TRADE,
};

export const SUBJECT_DOMAIN: Readonly<Record<string, RegExp>> = {
  ...PILLAR_12_DOMAINS,
  // Terms of art: a patent is a patent, a copyright a copyright, a trade secret a trade secret and
  // an encryption standard an encryption standard, in every one of these legal systems. The sector
  // domains that were here with them are gone -- see the note above.
  '2.1': PROCUREMENT,
  '2.2': SECRETS,
  '2.3': PROCUREMENT,
  '4.01': PATENT,
  '4.2': PATENT,
  '4.3': PATENT,
  '4.5': COPYRIGHT,
  '4.6': COPYRIGHT,
  '4.9': SECRETS,
  '4.1': SECRETS,
  // A standard names itself for the same reason an encryption standard does: every one of these
  // systems calls it a standard, a specification, a technical regulation or a code of practice,
  // and none of them has a way of setting one without using one of those words. Without it, 11.1
  // was decided in Malaysia by section 115 of the Trademarks Act -- "Any person who discloses or
  // makes use of any confidential information or document" -- a secrecy duty on investigators,
  // read as standards being set behind closed doors.
  '11.1': TECHNICAL_STANDARD,
  '11.4': /\b(encrypt\w*|cryptograph\w*|cipher\w*|key length|algorithm\w*|AES|DES|RSA|ECC|FIPS|ISO|IEC|ITU)\b/i,
};
