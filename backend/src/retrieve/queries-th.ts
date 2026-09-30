/**
 * The rubric's retrieval words in Thai, one for one with the English: every pillar name, category,
 * gloss, alternative wording and band criterion that `queriesFor` asks, keyed by the English it
 * renders.
 *
 * Thai law is written in Thai, and English asked of it finds it only by meaning. The lexical
 * channel matches no Thai text at all, so a Thai Act competes on the dense channel alone against
 * regulators' English notices that match on both. Rendered in the words a Thai statute uses --
 * คนต่างด้าว for a foreign person, ผู้รับใบอนุญาต for a licensee, ในราชอาณาจักร for within the
 * economy -- the same question reaches the provision in the language it was enacted in.
 *
 * Nothing here is new: a rendering says what its English says, the notes and exclusions included,
 * and adds no instrument's name. A test holds the table to the rubric, so an English wording that
 * changes without its Thai fails rather than silently asking the old question.
 */
export const THAI: Readonly<Record<string, string>> = {
  "Tariffs and Trade Defence":
    "ภาษีศุลกากรและมาตรการเยียวยาทางการค้า",
  "Trade defence measures including anti-dumping, countervailing duties and safeguards on ICT-related goods imported by other economies within the considered United Nations region":
    "มาตรการเยียวยาทางการค้า รวมถึงการตอบโต้การทุ่มตลาด การตอบโต้การอุดหนุน และมาตรการปกป้อง ที่ใช้กับสินค้าเทคโนโลยีสารสนเทศและการสื่อสารที่นำเข้าจากประเทศอื่นในภูมิภาคของสหประชาชาติที่พิจารณา",
  "an anti-dumping duty, countervailing duty or safeguard measure imposed on imported ICT or electronic goods":
    "อากรตอบโต้การทุ่มตลาด อากรตอบโต้การอุดหนุน หรือมาตรการปกป้องที่เรียกเก็บจากสินค้าเทคโนโลยีสารสนเทศและการสื่อสารหรือสินค้าอิเล็กทรอนิกส์ที่นำเข้า",
  "More than three measures":
    "มากกว่าสามมาตรการ",
  "Three measures":
    "สามมาตรการ",
  "Two measures":
    "สองมาตรการ",
  "One measure":
    "หนึ่งมาตรการ",
  "Public Procurement":
    "การจัดซื้อจัดจ้างภาครัฐ",
  "Foreign exclusions from public procurement related to ICT goods and digital services":
    "การกีดกันคนต่างด้าวจากการจัดซื้อจัดจ้างภาครัฐที่เกี่ยวกับสินค้าเทคโนโลยีสารสนเทศและการสื่อสารและบริการดิจิทัล",
  "a rule that excludes foreign firms from bidding for government contracts":
    "บทบัญญัติที่ห้ามผู้ประกอบการต่างด้าวเข้ายื่นข้อเสนอในการจัดซื้อจัดจ้างของหน่วยงานของรัฐ",
  "a rule that excludes some named group of foreign firms from government contracts, such as those from a particular country or without a local partner":
    "บทบัญญัติที่ห้ามผู้ประกอบการต่างด้าวบางกลุ่มเข้าทำสัญญากับหน่วยงานของรัฐ เช่น ผู้ประกอบการจากประเทศใดประเทศหนึ่ง หรือผู้ที่ไม่มีหุ้นส่วนในประเทศ",
  "For any legislative measure excludes foreign firms from public procurement under any circumstances, or more than one measure under category (2)":
    "มาตรการทางกฎหมายใดที่กีดกันผู้ประกอบการต่างด้าวจากการจัดซื้อจัดจ้างภาครัฐไม่ว่ากรณีใด หรือมีมากกว่าหนึ่งมาตรการตามประเภท (2)",
  "For any legislative measure excludes a specific (group) of foreign firm(s) from public procurement":
    "มาตรการทางกฎหมายใดที่กีดกันผู้ประกอบการต่างด้าวกลุ่มใดกลุ่มหนึ่งโดยเฉพาะจากการจัดซื้อจัดจ้างภาครัฐ",
  "Specific requirements on source codes, encryption and trade secrets":
    "ข้อกำหนดเฉพาะเกี่ยวกับรหัสต้นฉบับ การเข้ารหัส และความลับทางการค้า",
  "a requirement to hand over source code, patents, algorithms or trade secrets in order to bid for or win a government contract":
    "ข้อกำหนดให้ส่งมอบรหัสต้นฉบับ สิทธิบัตร อัลกอริทึม หรือความลับทางการค้า เพื่อเข้ายื่นข้อเสนอหรือได้รับสัญญาจากหน่วยงานของรัฐ",
  "a requirement to use a particular encryption method or cryptographic standard in order to win a government contract":
    "ข้อกำหนดให้ใช้วิธีการเข้ารหัสหรือมาตรฐานการเข้ารหัสลับอย่างใดอย่างหนึ่งโดยเฉพาะ เพื่อได้รับสัญญาจากหน่วยงานของรัฐ",
  "For any requirement to surrender patents, source codes or trade secrets as a condition for participating in tenders":
    "ข้อกำหนดใดที่ให้ส่งมอบสิทธิบัตร รหัสต้นฉบับ หรือความลับทางการค้า เป็นเงื่อนไขในการเข้าร่วมการประกวดราคา",
  "For any requirement to use specific encryption to win tenders":
    "ข้อกำหนดใดที่ให้ใช้การเข้ารหัสเฉพาะเพื่อชนะการประกวดราคา",
  "Limitations in procurement bidding":
    "ข้อจำกัดในการเสนอราคาในการจัดซื้อจัดจ้าง",
  "a condition in government procurement that treats foreign bidders worse than local ones, such as a price preference for domestic suppliers":
    "เงื่อนไขในการจัดซื้อจัดจ้างภาครัฐที่ปฏิบัติต่อผู้เสนอราคาต่างด้าวด้อยกว่าผู้เสนอราคาในประเทศ เช่น การให้แต้มต่อด้านราคาแก่ผู้ประกอบการในประเทศหรือพัสดุที่ผลิตในประเทศ",
  "a condition on every bidder for a government contract, such as a local content share, a local employment target or another performance undertaking":
    "เงื่อนไขที่ใช้กับผู้เสนอราคาทุกรายในการจัดซื้อจัดจ้างของหน่วยงานของรัฐ เช่น สัดส่วนการใช้พัสดุที่ผลิตในประเทศ เป้าหมายการจ้างแรงงานในประเทศ หรือข้อผูกพันด้านผลการดำเนินงานอื่น",
  "a project proponent or tenderer must prepare and comply with an approved industry participation plan giving local suppliers full, fair and reasonable opportunity to supply":
    "ผู้ดำเนินโครงการหรือผู้ยื่นข้อเสนอต้องจัดทำและปฏิบัติตามแผนการมีส่วนร่วมของอุตสาหกรรมที่ได้รับอนุมัติ ซึ่งเปิดโอกาสให้ผู้ประกอบการในประเทศได้เสนอขายพัสดุอย่างเต็มที่ เป็นธรรม และสมเหตุสมผล",
  "For any measure that directly discriminate against foreign bidders OR more than one measure under category (2)":
    "มาตรการใดที่เลือกปฏิบัติต่อผู้เสนอราคาต่างด้าวโดยตรง หรือมีมากกว่าหนึ่งมาตรการตามประเภท (2)",
  "For any measures measure that applies to all bidders, such as local content requirements and performance-based conditions":
    "มาตรการใดที่ใช้กับผู้เสนอราคาทุกราย เช่น ข้อกำหนดการใช้พัสดุที่ผลิตในประเทศ และเงื่อนไขด้านผลการดำเนินงาน",
  "Foreign Direct Investment":
    "การลงทุนโดยตรงจากต่างประเทศ",
  "Foreign equity limits in sectors relevant to digital trade":
    "ข้อจำกัดการถือหุ้นของคนต่างด้าวในสาขาที่เกี่ยวข้องกับการค้าดิจิทัล",
  "a rule that no share of a company in a sector relevant to digital trade -- computing, data services, media, logistics, finance -- may be held by a foreign person; not telecommunications and not e-commerce, which are asked about elsewhere":
    "บทบัญญัติที่ห้ามคนต่างด้าวถือหุ้นใดในบริษัทที่ประกอบกิจการในสาขาที่เกี่ยวข้องกับการค้าดิจิทัล เช่น คอมพิวเตอร์ บริการข้อมูล สื่อ โลจิสติกส์ การเงิน ทั้งนี้ ไม่รวมกิจการโทรคมนาคมและพาณิชย์อิเล็กทรอนิกส์ ซึ่งพิจารณาแยกต่างหาก",
  "shares which may not be held by a foreign company or by a non-citizen":
    "หุ้นที่ห้ามมิให้บริษัทต่างด้าวหรือบุคคลที่ไม่มีสัญชาติไทยถือ",
  "a limit letting a foreign person hold only a minority of a company in a sector relevant to digital trade -- half the shares or fewer, however the provision phrases it, including a floor on the proportion that must be held locally":
    "ข้อจำกัดที่ให้คนต่างด้าวถือหุ้นได้เพียงส่วนน้อยของบริษัทในสาขาที่เกี่ยวข้องกับการค้าดิจิทัล คือ ไม่เกินกึ่งหนึ่งของหุ้นทั้งหมด ไม่ว่าบทบัญญัติจะเขียนไว้อย่างไร รวมถึงการกำหนดสัดส่วนขั้นต่ำที่ต้องถือโดยผู้มีสัญชาติไทย",
  "a limit letting a foreign person hold more than half but not all of a company in a sector relevant to digital trade":
    "ข้อจำกัดที่ให้คนต่างด้าวถือหุ้นได้เกินกึ่งหนึ่งแต่ไม่ทั้งหมดของบริษัทในสาขาที่เกี่ยวข้องกับการค้าดิจิทัล",
  "a limit on foreign shareholding that bites only in a state-owned or government-linked company, leaving privately held companies free":
    "ข้อจำกัดการถือหุ้นของคนต่างด้าวที่ใช้เฉพาะกับรัฐวิสาหกิจหรือบริษัทที่รัฐเกี่ยวข้อง โดยบริษัทเอกชนไม่อยู่ภายใต้ข้อจำกัดนั้น",
  "Ban (0%) in at least one sector OR if only a minority stake in more than one sector":
    "ห้ามถือหุ้น (ร้อยละ 0) ในอย่างน้อยหนึ่งสาขา หรือถือได้เพียงส่วนน้อยในมากกว่าหนึ่งสาขา",
  "A minority stake (1-50%) allowed in one sector":
    "อนุญาตให้ถือหุ้นส่วนน้อย (ร้อยละ 1-50) ในหนึ่งสาขา",
  "A controlling stake (51-99%) allowed OR restrictions only exist in SOEs":
    "อนุญาตให้ถือหุ้นส่วนใหญ่ที่มีอำนาจควบคุม (ร้อยละ 51-99) หรือมีข้อจำกัดเฉพาะในรัฐวิสาหกิจ",
  "Full ownership (100%) allowed in relevant for digital trade":
    "อนุญาตให้ถือหุ้นได้ทั้งหมด (ร้อยละ 100) ในสาขาที่เกี่ยวข้องกับการค้าดิจิทัล",
  "Joint venture requirements":
    "ข้อกำหนดให้ร่วมทุน",
  "a requirement that a foreign investor operate through a joint venture or in partnership with a local company":
    "ข้อกำหนดให้ผู้ลงทุนต่างด้าวประกอบกิจการโดยการร่วมทุนหรือเป็นหุ้นส่วนกับบริษัทในประเทศ",
  "For any measure":
    "มาตรการใด",
  "Nationality or residency requirements for board of directors or managers":
    "ข้อกำหนดด้านสัญชาติหรือถิ่นที่อยู่ของกรรมการหรือผู้จัดการ",
  "a requirement that directors, managers or the company secretary be nationals of this economy or resident here":
    "ข้อกำหนดให้กรรมการ ผู้จัดการ หรือเลขานุการบริษัท ต้องมีสัญชาติไทยหรือมีถิ่นที่อยู่ในราชอาณาจักร",
  "Screening of investment and acquisitions":
    "การกลั่นกรองการลงทุนและการเข้าซื้อกิจการ",
  "a mechanism under which a foreign investment or an acquisition of a business must be notified to, approved by or cleared with an authority before it may proceed; not ordinary competition-law merger review, which this indicator excludes":
    "กลไกที่การลงทุนของคนต่างด้าวหรือการเข้าซื้อกิจการต้องแจ้ง ได้รับอนุญาต หรือได้รับความเห็นชอบจากหน่วยงานของรัฐก่อนจึงจะดำเนินการได้ ทั้งนี้ ไม่รวมการพิจารณาการรวมธุรกิจตามกฎหมายการแข่งขันทางการค้าตามปกติ ซึ่งตัวชี้วัดนี้ไม่นับ",
  "approval of the Minister required before a foreign person acquires an interest in a business":
    "คนต่างด้าวต้องได้รับอนุญาตจากรัฐมนตรีก่อนเข้าถือหุ้นหรือได้มาซึ่งส่วนได้เสียในธุรกิจ",
  "a merger or acquisition review that treats a foreign acquirer differently from a local one; ordinary anti-trust review applying alike to both is not this measure":
    "การพิจารณาการรวมธุรกิจหรือการเข้าซื้อกิจการที่ปฏิบัติต่อผู้ซื้อต่างด้าวแตกต่างจากผู้ซื้อในประเทศ ทั้งนี้ การพิจารณาตามกฎหมายการแข่งขันทางการค้าที่ใช้กับทั้งสองฝ่ายเหมือนกันไม่ใช่มาตรการนี้",
  "A case that the screening mechanism has been used to block an investment in a sector relevant for digital trade":
    "กรณีที่มีการใช้กลไกการกลั่นกรองเพื่อยับยั้งการลงทุนในสาขาที่เกี่ยวข้องกับการค้าดิจิทัล",
  "Two or more investment screening mechanisms":
    "กลไกการกลั่นกรองการลงทุนตั้งแต่สองกลไกขึ้นไป",
  "A screening mechanism":
    "กลไกการกลั่นกรองการลงทุน",
  "Commercial presence requirements to offer cross-border services in sectors relevant to digital trade":
    "ข้อกำหนดให้มีสถานประกอบการในประเทศเพื่อให้บริการข้ามพรมแดนในสาขาที่เกี่ยวข้องกับการค้าดิจิทัล",
  "a requirement to establish a branch, subsidiary or other commercial presence in the economy before supplying a service to customers here, including a requirement that a foreign company register locally, or keep a local office or agent, before it may carry on business here":
    "ข้อกำหนดให้จัดตั้งสาขา บริษัทในเครือ หรือสถานประกอบการอื่นในราชอาณาจักรก่อนให้บริการแก่ลูกค้าในราชอาณาจักร รวมถึงข้อกำหนดให้นิติบุคคลต่างประเทศจดทะเบียนในประเทศ หรือต้องมีสำนักงานหรือตัวแทนในราชอาณาจักรก่อนจึงจะประกอบธุรกิจในราชอาณาจักรได้",
  "Intellectual Property Rights":
    "สิทธิในทรัพย์สินทางปัญญา",
  "Patent application issues":
    "ประเด็นเกี่ยวกับการขอรับสิทธิบัตร",
  "a rule in patent applications that treats foreign applicants worse than local ones, or refuses their applications on grounds that do not apply to locals":
    "บทบัญญัติเกี่ยวกับการขอรับสิทธิบัตรที่ปฏิบัติต่อผู้ขอรับสิทธิบัตรต่างด้าวด้อยกว่าผู้ขอในประเทศ หรือปฏิเสธคำขอด้วยเหตุที่ไม่ใช้กับผู้ขอในประเทศ",
  "a requirement that a patent applicant appoint a local agent, attorney or address for service in the economy":
    "ข้อกำหนดให้ผู้ขอรับสิทธิบัตรแต่งตั้งตัวแทน ผู้รับมอบอำนาจ หรือมีที่อยู่สำหรับการติดต่อในราชอาณาจักร",
  "a requirement to file a patent application in this economy before filing it abroad":
    "ข้อกำหนดให้ยื่นคำขอรับสิทธิบัตรในราชอาณาจักรก่อนยื่นคำขอในต่างประเทศ",
  "a requirement that a patent application undergo substantive examination before it is granted":
    "ข้อกำหนดให้คำขอรับสิทธิบัตรต้องผ่านการตรวจสอบการประดิษฐ์ก่อนการออกสิทธิบัตร",
  "Differential treatment between local and foreign firms, requirements to appoint local representative, and a rejection of patent application in a discriminatory manner.":
    "การปฏิบัติที่แตกต่างกันระหว่างผู้ประกอบการในประเทศและต่างประเทศ ข้อกำหนดให้แต่งตั้งตัวแทนในประเทศ และการปฏิเสธคำขอรับสิทธิบัตรในลักษณะเลือกปฏิบัติ",
  "Non-transparent process, high filing fees, high registration costs, substantive examination, and the requirement to file a patent locally before filing abroad.":
    "กระบวนการที่ไม่โปร่งใส ค่าธรรมเนียมคำขอสูง ค่าใช้จ่ายในการจดทะเบียนสูง การตรวจสอบการประดิษฐ์ และข้อกำหนดให้ยื่นคำขอรับสิทธิบัตรในประเทศก่อนยื่นในต่างประเทศ",
  "Patent enforcement issues: civil and administrative procedures and remedies; and provisional measures":
    "ประเด็นการบังคับใช้สิทธิบัตร: กระบวนการและการเยียวยาทางแพ่งและทางปกครอง และวิธีการคุ้มครองชั่วคราว",
  "a civil or administrative procedure by which a patent holder can sue for infringement of a patent and obtain a remedy such as damages, an account of profits or an injunction. Copyright is not a patent: an action over a copyright work belongs to 4.6":
    "กระบวนการทางแพ่งหรือทางปกครองที่ผู้ทรงสิทธิบัตรสามารถฟ้องคดีละเมิดสิทธิบัตรและได้รับการเยียวยา เช่น ค่าเสียหาย การคืนกำไร หรือคำสั่งห้ามการกระทำ ทั้งนี้ ลิขสิทธิ์ไม่ใช่สิทธิบัตร คดีเกี่ยวกับงานอันมีลิขสิทธิ์อยู่ในตัวชี้วัด 4.6",
  "proceedings for infringement of a patent may be brought by the patentee":
    "ผู้ทรงสิทธิบัตรอาจฟ้องคดีละเมิดสิทธิบัตรได้",
  "the court may grant an injunction restraining infringement of the patent":
    "ศาลอาจมีคำสั่งห้ามการกระทำที่ละเมิดสิทธิบัตร",
  "a provisional or interim measure in a patent case, such as an interlocutory injunction, a search order or the seizure of infringing goods before trial":
    "วิธีการคุ้มครองชั่วคราวในคดีสิทธิบัตร เช่น คำสั่งห้ามชั่วคราว คำสั่งให้ค้น หรือการยึดสินค้าที่ละเมิดก่อนการพิจารณาคดี",
  "Absence of civil and administrative procedures and remedies, and provisional measures":
    "ไม่มีกระบวนการและการเยียวยาทางแพ่งและทางปกครอง และวิธีการคุ้มครองชั่วคราว",
  "Adopt civil and administrative procedures and remedies, or provisional measures":
    "มีกระบวนการและการเยียวยาทางแพ่งและทางปกครอง หรือวิธีการคุ้มครองชั่วคราว",
  "Adopt civil and administrative procedures and remedies, and provisional measures":
    "มีกระบวนการและการเยียวยาทางแพ่งและทางปกครอง และวิธีการคุ้มครองชั่วคราว",
  "Patent enforcement issues: others":
    "ประเด็นการบังคับใช้สิทธิบัตร: อื่น ๆ",
  "a restriction on enforcing a patent, such as a compulsory licence, a limit on injunctions, a cap on damages or a bar on who may bring proceedings":
    "ข้อจำกัดการบังคับใช้สิทธิบัตร เช่น การบังคับใช้สิทธิตามสิทธิบัตร ข้อจำกัดการออกคำสั่งห้าม เพดานค่าเสียหาย หรือข้อจำกัดว่าผู้ใดอาจฟ้องคดีได้",
  "For any restriction with high impact, when the issue affecting all circumstances and sectors, OR more than one measure of category (2)":
    "ข้อจำกัดใดที่มีผลกระทบสูง เมื่อประเด็นนั้นกระทบทุกกรณีและทุกสาขา หรือมีมากกว่าหนึ่งมาตรการตามประเภท (2)",
  "For any restriction with limited impact, when the issue affecting to a specific circumstance or sector":
    "ข้อจำกัดใดที่มีผลกระทบจำกัด เมื่อประเด็นนั้นกระทบเฉพาะกรณีหรือสาขาใดสาขาหนึ่ง",
  "Lack of copyright framework and exceptions":
    "การขาดกรอบกฎหมายลิขสิทธิ์และข้อยกเว้น",
  "a general exception to copyright under which any use may qualify when weighed against stated factors -- the purpose and character of the use, the nature of the work, the amount used, the effect on the market -- rather than only uses for listed purposes":
    "ข้อยกเว้นทั่วไปของการละเมิดลิขสิทธิ์ ซึ่งการใช้งานใดก็อาจเข้าข่ายได้เมื่อพิจารณาตามปัจจัยที่กำหนด ได้แก่ วัตถุประสงค์และลักษณะของการใช้ ลักษณะของงาน ปริมาณที่นำมาใช้ และผลกระทบต่อตลาด มิใช่เฉพาะการใช้เพื่อวัตถุประสงค์ที่ระบุไว้",
  "an exception to copyright confined to named purposes -- research, criticism, review, news reporting -- including fair dealing for those purposes, or one conditioned on not conflicting with normal exploitation and not unreasonably prejudicing the rights holder":
    "ข้อยกเว้นการละเมิดลิขสิทธิ์ที่จำกัดเฉพาะวัตถุประสงค์ที่ระบุไว้ เช่น การวิจัย การติชม การวิจารณ์ การเสนอรายงานข่าว รวมถึงการใช้โดยชอบธรรมเพื่อวัตถุประสงค์เหล่านั้น หรือข้อยกเว้นที่มีเงื่อนไขว่าต้องไม่ขัดต่อการแสวงหาประโยชน์จากงานอันมีลิขสิทธิ์ตามปกติ และไม่กระทบกระเทือนถึงสิทธิอันชอบด้วยกฎหมายของเจ้าของลิขสิทธิ์เกินสมควร",
  "Lack of copyright legal framework OR lack of copyright exceptions":
    "การขาดกรอบกฎหมายลิขสิทธิ์ หรือการขาดข้อยกเว้นการละเมิดลิขสิทธิ์",
  "Unclear copyright exceptions, such as three-step test and other types of copyright exceptions":
    "ข้อยกเว้นการละเมิดลิขสิทธิ์ที่ไม่ชัดเจน เช่น หลักการทดสอบสามขั้นตอนและข้อยกเว้นลิขสิทธิ์ประเภทอื่น",
  "Clear copyright exceptions following fair use or fair dealing model":
    "ข้อยกเว้นการละเมิดลิขสิทธิ์ที่ชัดเจนตามแบบการใช้โดยชอบธรรม",
  "Online copyright enforcement issues: civil and administrative procedures and remedies; and provisional measures":
    "ประเด็นการบังคับใช้ลิขสิทธิ์ออนไลน์: กระบวนการและการเยียวยาทางแพ่งและทางปกครอง และวิธีการคุ้มครองชั่วคราว",
  "a civil or administrative procedure by which a copyright owner can sue for infringement and obtain a remedy such as damages, an account of profits or an injunction. A patent is not a copyright: an action over a patent belongs to 4.2":
    "กระบวนการทางแพ่งหรือทางปกครองที่เจ้าของลิขสิทธิ์สามารถฟ้องคดีละเมิดและได้รับการเยียวยา เช่น ค่าเสียหาย การคืนกำไร หรือคำสั่งห้ามการกระทำ ทั้งนี้ สิทธิบัตรไม่ใช่ลิขสิทธิ์ คดีเกี่ยวกับสิทธิบัตรอยู่ในตัวชี้วัด 4.2",
  "an action for infringement of copyright may be brought by the owner of the copyright":
    "เจ้าของลิขสิทธิ์อาจฟ้องคดีละเมิดลิขสิทธิ์ได้",
  "the court may order a network service provider to disable access to the infringing material":
    "ศาลอาจมีคำสั่งให้ผู้ให้บริการระงับการเข้าถึงสิ่งที่ละเมิดลิขสิทธิ์ในระบบคอมพิวเตอร์",
  "a provisional or interim measure in a copyright case, such as an interlocutory injunction, a blocking order or the seizure of infringing copies before trial":
    "วิธีการคุ้มครองชั่วคราวในคดีลิขสิทธิ์ เช่น คำสั่งห้ามชั่วคราว คำสั่งปิดกั้น หรือการยึดสำเนางานที่ละเมิดก่อนการพิจารณาคดี",
  "Mandatory disclosure of trade secrets, such as souce code and algorithms":
    "การบังคับให้เปิดเผยความลับทางการค้า เช่น รหัสต้นฉบับและอัลกอริทึม",
  "a requirement to disclose source code, algorithms or other trade secrets to a government body, apart from disclosure ordered to protect the public interest where the law also guards against unfair commercial use":
    "ข้อกำหนดให้เปิดเผยรหัสต้นฉบับ อัลกอริทึม หรือความลับทางการค้าอื่นต่อหน่วยงานของรัฐ เว้นแต่การเปิดเผยเพื่อคุ้มครองประโยชน์สาธารณะซึ่งกฎหมายคุ้มครองมิให้นำไปใช้ประโยชน์ทางการค้าโดยไม่เป็นธรรมด้วย",
  "For any disclosure requirement affecting an entire sector or all sectors horizontally OR More than one measure of category (2)":
    "ข้อกำหนดการเปิดเผยใดที่กระทบทั้งสาขาหรือทุกสาขาในแนวราบ หรือมีมากกว่าหนึ่งมาตรการตามประเภท (2)",
  "For any disclosure requirement of limited impact affecting only specific types of products or specific circumstance (i.e., disclosure due to court order, regulatory proceedings, or national threat provision for certain companies)":
    "ข้อกำหนดการเปิดเผยใดที่มีผลกระทบจำกัด กระทบเฉพาะผลิตภัณฑ์บางประเภทหรือกรณีเฉพาะ (เช่น การเปิดเผยตามคำสั่งศาล กระบวนการของหน่วยงานกำกับดูแล หรือบทบัญญัติด้านภัยต่อความมั่นคงของชาติสำหรับบางบริษัท)",
  "Lack of effective trade secrets legal framework":
    "การขาดกรอบกฎหมายคุ้มครองความลับทางการค้าที่มีประสิทธิภาพ",
  "protection for confidential business information or trade secrets, giving the holder a remedy against someone who acquires, uses or discloses it without consent":
    "การคุ้มครองข้อมูลทางธุรกิจที่เป็นความลับหรือความลับทางการค้า โดยให้ผู้ควบคุมความลับทางการค้ามีสิทธิได้รับการเยียวยาจากผู้ที่ได้มา ใช้ หรือเปิดเผยความลับนั้นโดยไม่ได้รับความยินยอม",
  "a single clause protecting confidential information inside a law about something else, such as a duty of confidence owed by an employee or an official":
    "บทบัญญัติเพียงข้อเดียวที่คุ้มครองข้อมูลที่เป็นความลับในกฎหมายเรื่องอื่น เช่น หน้าที่รักษาความลับของลูกจ้างหรือเจ้าหน้าที่",
  "Lack of trade secrets legal framework that is able to provide effective protection":
    "การขาดกรอบกฎหมายคุ้มครองความลับทางการค้าที่ให้ความคุ้มครองได้อย่างมีประสิทธิภาพ",
  "Limited practice/scope addressing protection of trade secrets OR practices with certain clauses included in the IP law/ relevant law":
    "แนวปฏิบัติหรือขอบเขตที่จำกัดในการคุ้มครองความลับทางการค้า หรือมีบทบัญญัติบางข้อในกฎหมายทรัพย์สินทางปัญญาหรือกฎหมายที่เกี่ยวข้อง",
  "Presence of effective protection of trade secrets protection in any forms":
    "มีการคุ้มครองความลับทางการค้าอย่างมีประสิทธิภาพไม่ว่าในรูปแบบใด",
  "Telecom Regulations & Competition":
    "การกำกับดูแลและการแข่งขันในกิจการโทรคมนาคม",
  "Lack of passive infrastructure sharing":
    "การขาดการใช้โครงสร้างพื้นฐานแบบพาสซีฟร่วมกัน",
  "a duty on a telecommunications operator to share passive infrastructure -- towers, masts, ducts, poles, trenches or sites -- with another operator":
    "หน้าที่ของผู้ประกอบกิจการโทรคมนาคมในการให้ผู้ประกอบการรายอื่นใช้โครงสร้างพื้นฐานแบบพาสซีฟร่วมกัน เช่น เสา ท่อร้อยสาย เสาไฟฟ้า ร่องสาย หรือสถานที่ติดตั้ง",
  "a duty on one operator to give another operator access, on request, to a tower, to the site of a tower, or to an underground facility":
    "หน้าที่ของผู้ประกอบการรายหนึ่งในการให้ผู้ประกอบการรายอื่นเข้าใช้เสา พื้นที่ตั้งเสา หรือสิ่งอำนวยความสะดวกใต้ดิน เมื่อได้รับการร้องขอ",
  "No passive infrastructure sharing obligation":
    "ไม่มีข้อผูกพันให้ใช้โครงสร้างพื้นฐานแบบพาสซีฟร่วมกัน",
  "Passive sharing is not mandated, but it is practiced in the market":
    "ไม่มีการบังคับให้ใช้โครงสร้างพื้นฐานแบบพาสซีฟร่วมกัน แต่มีการปฏิบัติในตลาด",
  "Passive sharing is mandated":
    "มีการบังคับให้ใช้โครงสร้างพื้นฐานแบบพาสซีฟร่วมกัน",
  "Foreign equity limits in telecom sector":
    "ข้อจำกัดการถือหุ้นของคนต่างด้าวในกิจการโทรคมนาคม",
  "a rule that no share of a telecommunications licensee, carrier or network operator may be held by a foreign person":
    "บทบัญญัติที่ห้ามคนต่างด้าวถือหุ้นใดในผู้รับใบอนุญาตประกอบกิจการโทรคมนาคม ผู้ให้บริการ หรือผู้ประกอบการโครงข่าย",
  "shares in a licensed telecommunications company which a non-citizen may not hold":
    "หุ้นในบริษัทผู้รับใบอนุญาตประกอบกิจการโทรคมนาคมที่ห้ามมิให้บุคคลที่ไม่มีสัญชาติไทยถือ",
  "a limit letting a foreign person hold only a minority of a telecommunications licensee or carrier -- half the shares or fewer, including a floor on the proportion that must be held locally":
    "ข้อจำกัดที่ให้คนต่างด้าวถือหุ้นได้เพียงส่วนน้อยในผู้รับใบอนุญาตประกอบกิจการโทรคมนาคม คือ ไม่เกินกึ่งหนึ่งของหุ้นทั้งหมด รวมถึงการกำหนดสัดส่วนขั้นต่ำที่ต้องถือโดยผู้มีสัญชาติไทย",
  "a limit letting a foreign person hold more than half but not all of a telecommunications licensee or carrier":
    "ข้อจำกัดที่ให้คนต่างด้าวถือหุ้นได้เกินกึ่งหนึ่งแต่ไม่ทั้งหมดในผู้รับใบอนุญาตประกอบกิจการโทรคมนาคม",
  "a limit on foreign shareholding in telecommunications that bites only in a state-owned or government-linked operator":
    "ข้อจำกัดการถือหุ้นของคนต่างด้าวในกิจการโทรคมนาคมที่ใช้เฉพาะกับผู้ประกอบการที่เป็นรัฐวิสาหกิจหรือที่รัฐเกี่ยวข้อง",
  "Ban (0%) OR if only a minority stake in more than one measures":
    "ห้ามถือหุ้น (ร้อยละ 0) หรือถือได้เพียงส่วนน้อยในมากกว่าหนึ่งมาตรการ",
  "A minority stake (1-50%) allowed":
    "อนุญาตให้ถือหุ้นส่วนน้อย (ร้อยละ 1-50)",
  "Full ownership (100%) allowed in telecommunication sector":
    "อนุญาตให้ถือหุ้นได้ทั้งหมด (ร้อยละ 100) ในกิจการโทรคมนาคม",
  "Shares owned by the Government in telecom companies":
    "หุ้นที่รัฐถือในบริษัทโทรคมนาคม",
  "At least one companies with government shares above 50% OR more than one measure of category (2)":
    "มีบริษัทอย่างน้อยหนึ่งแห่งที่รัฐถือหุ้นเกินร้อยละ 50 หรือมีมากกว่าหนึ่งมาตรการตามประเภท (2)",
  "One company with government shares between 1% and 50%":
    "มีบริษัทหนึ่งแห่งที่รัฐถือหุ้นระหว่างร้อยละ 1 ถึงร้อยละ 50",
  "Lack of functional/accounting separation":
    "การขาดการแยกโครงสร้างการดำเนินงานหรือการแยกบัญชี",
  "a duty on a telecommunications operator to keep separate accounts for different services or for wholesale and retail activities":
    "หน้าที่ของผู้ประกอบกิจการโทรคมนาคมในการจัดทำบัญชีแยกตามประเภทบริการ หรือแยกระหว่างกิจการขายส่งและขายปลีก",
  "a duty on a telecommunications operator to run its network business as a separate unit or entity from its retail business":
    "หน้าที่ของผู้ประกอบกิจการโทรคมนาคมในการแยกกิจการโครงข่ายออกเป็นหน่วยงานหรือนิติบุคคลต่างหากจากกิจการขายปลีก",
  "No functional/accounting separation is mandated":
    "ไม่มีการบังคับให้แยกโครงสร้างการดำเนินงานหรือแยกบัญชี",
  "Only accounting separation is mandated":
    "บังคับให้แยกบัญชีเท่านั้น",
  "Only functional separation is mandated":
    "บังคับให้แยกโครงสร้างการดำเนินงานเท่านั้น",
  "Both accounting and functional separations are mandated":
    "บังคับให้แยกทั้งบัญชีและโครงสร้างการดำเนินงาน",
  "Licensing requirements in telecom sector for operators":
    "ข้อกำหนดการอนุญาตประกอบกิจการโทรคมนาคมสำหรับผู้ประกอบการ",
  "a licence to operate a telecommunications network or service that carries a strict condition, such as a minimum paid-up capital, a coverage or rollout obligation, or a worse condition for foreign operators":
    "ใบอนุญาตประกอบกิจการโครงข่ายหรือบริการโทรคมนาคมที่มีเงื่อนไขเข้มงวด เช่น ทุนจดทะเบียนที่ชำระแล้วขั้นต่ำ หน้าที่ขยายโครงข่ายหรือพื้นที่ให้บริการ หรือเงื่อนไขที่ด้อยกว่าสำหรับผู้ประกอบการต่างด้าว",
  "For any strict licensing scheme (e.g., discrimination for foreign providers, minimum capital requirements, and mandatory performances requirements)":
    "การอนุญาตใดที่เข้มงวด (เช่น การเลือกปฏิบัติต่อผู้ให้บริการต่างด้าว ข้อกำหนดทุนขั้นต่ำ และข้อกำหนดด้านผลการดำเนินงานที่บังคับ)",
  "Lack of independent telecom authority":
    "การขาดหน่วยงานกำกับดูแลกิจการโทรคมนาคมที่เป็นอิสระ",
  "the establishment of a telecommunications or communications regulator as a body separate from the ministry, with its own officers and its own functions":
    "การจัดตั้งหน่วยงานกำกับดูแลกิจการโทรคมนาคมหรือกิจการสื่อสารเป็นองค์กรที่แยกจากกระทรวง มีเจ้าหน้าที่และอำนาจหน้าที่ของตนเอง",
  "No independent telecom authority":
    "ไม่มีหน่วยงานกำกับดูแลกิจการโทรคมนาคมที่เป็นอิสระ",
  "Independent telecom authority is established":
    "มีการจัดตั้งหน่วยงานกำกับดูแลกิจการโทรคมนาคมที่เป็นอิสระ",
  "Cross-border Data Policies":
    "นโยบายข้อมูลข้ามพรมแดน",
  "Ban and local processing requirements":
    "การห้ามและข้อกำหนดให้ประมวลผลข้อมูลในประเทศ",
  "a prohibition on transferring data out of the economy":
    "การห้ามส่งหรือโอนข้อมูลออกไปนอกราชอาณาจักร",
  "a requirement that data be processed within the economy":
    "ข้อกำหนดให้ประมวลผลข้อมูลภายในราชอาณาจักร",
  "Ban and/or local processing requirement for all sectors or personal data, OR more than one measure in category (2)":
    "การห้ามและ/หรือข้อกำหนดให้ประมวลผลข้อมูลในประเทศสำหรับทุกสาขาหรือข้อมูลส่วนบุคคล หรือมีมากกว่าหนึ่งมาตรการตามประเภท (2)",
  "Ban and/or local processing requirement applied to specific sector, specific data, non-personal data, or transfer is prohibited to one country":
    "การห้ามและ/หรือข้อกำหนดให้ประมวลผลข้อมูลในประเทศที่ใช้กับสาขาเฉพาะ ข้อมูลเฉพาะ ข้อมูลที่ไม่ใช่ข้อมูลส่วนบุคคล หรือห้ามโอนข้อมูลไปยังประเทศใดประเทศหนึ่ง",
  "Local storage requirements":
    "ข้อกำหนดให้จัดเก็บข้อมูลในประเทศ",
  "a requirement that data be stored or kept within the economy":
    "ข้อกำหนดให้จัดเก็บหรือเก็บรักษาข้อมูลไว้ภายในราชอาณาจักร",
  "a requirement that records or documents be kept and retained within the economy":
    "ข้อกำหนดให้เก็บรักษาบันทึกหรือเอกสารไว้ภายในราชอาณาจักร",
  "Local storage requirement for all sectors or personal data, OR more than one measure in category (2)":
    "ข้อกำหนดให้จัดเก็บข้อมูลในประเทศสำหรับทุกสาขาหรือข้อมูลส่วนบุคคล หรือมีมากกว่าหนึ่งมาตรการตามประเภท (2)",
  "Local storage requirement applied to specific sector, specific data or non-personal data":
    "ข้อกำหนดให้จัดเก็บข้อมูลในประเทศที่ใช้กับสาขาเฉพาะ ข้อมูลเฉพาะ หรือข้อมูลที่ไม่ใช่ข้อมูลส่วนบุคคล",
  "Infrastructure requirements":
    "ข้อกำหนดด้านโครงสร้างพื้นฐาน",
  "a requirement to use computing facilities, servers or infrastructure located in the economy":
    "ข้อกำหนดให้ใช้อุปกรณ์คอมพิวเตอร์ เครื่องแม่ข่าย หรือโครงสร้างพื้นฐานที่ตั้งอยู่ในราชอาณาจักร",
  "Infrastructure requirement":
    "ข้อกำหนดด้านโครงสร้างพื้นฐาน",
  "Conditional flow regimes":
    "ระบบการโอนข้อมูลแบบมีเงื่อนไข",
  "a condition that must be met before data may be transferred out, the transfer being permitted once it is met":
    "เงื่อนไขที่ต้องปฏิบัติตามก่อนส่งหรือโอนข้อมูลไปต่างประเทศ ซึ่งเมื่อปฏิบัติตามแล้วจึงโอนได้",
  "cross-border disclosure of personal information to an overseas recipient":
    "การเปิดเผยข้อมูลส่วนบุคคลข้ามพรมแดนแก่ผู้รับในต่างประเทศ",
  "before disclosing personal information overseas the discloser must take reasonable steps to ensure the recipient complies":
    "ก่อนเปิดเผยข้อมูลส่วนบุคคลไปยังต่างประเทศ ผู้เปิดเผยต้องดำเนินการตามสมควรเพื่อให้ผู้รับปฏิบัติตามมาตรฐานการคุ้มครองข้อมูล",
  "personal data may be transferred outside the economy only where the recipient affords a comparable standard of protection":
    "การส่งหรือโอนข้อมูลส่วนบุคคลไปยังต่างประเทศจะกระทำได้เฉพาะเมื่อผู้รับข้อมูลมีมาตรฐานการคุ้มครองข้อมูลส่วนบุคคลที่เทียบเท่า",
  "Conditions for all sectors or personal data":
    "เงื่อนไขสำหรับทุกสาขาหรือข้อมูลส่วนบุคคล",
  "Conditions for specific data or non-personal data":
    "เงื่อนไขสำหรับข้อมูลเฉพาะหรือข้อมูลที่ไม่ใช่ข้อมูลส่วนบุคคล",
  "Domestic Data Protection & Privacy":
    "การคุ้มครองข้อมูลและความเป็นส่วนตัวภายในประเทศ",
  "Lack of comprehensive legal framework for data protection":
    "การขาดกรอบกฎหมายการคุ้มครองข้อมูลที่ครอบคลุม",
  "No data protection legal framework":
    "ไม่มีกรอบกฎหมายการคุ้มครองข้อมูล",
  "Data protection legal framework only to specific sectors (sectoral law)":
    "กรอบกฎหมายการคุ้มครองข้อมูลเฉพาะบางสาขา (กฎหมายรายสาขา)",
  "Comprehensive data protection framework":
    "กรอบกฎหมายการคุ้มครองข้อมูลที่ครอบคลุม",
  "Lack of dedicated legal framework for cybersecurity":
    "การขาดกรอบกฎหมายเฉพาะด้านการรักษาความมั่นคงปลอดภัยไซเบอร์",
  "No cybersecurity legal framework":
    "ไม่มีกรอบกฎหมายการรักษาความมั่นคงปลอดภัยไซเบอร์",
  "Non-dedicated cybersecurity legal framework and/or dedicated cybersecurity law only to specific sectors (sectoral law)":
    "กรอบกฎหมายการรักษาความมั่นคงปลอดภัยไซเบอร์ที่ไม่ใช่กฎหมายเฉพาะ และ/หรือกฎหมายเฉพาะด้านไซเบอร์ที่ใช้เฉพาะบางสาขา (กฎหมายรายสาขา)",
  "Dedicated cybersecurity legal framework (horizontal)":
    "กรอบกฎหมายเฉพาะด้านการรักษาความมั่นคงปลอดภัยไซเบอร์ (ในแนวราบ)",
  "Minimum period of data retention requirements":
    "ข้อกำหนดระยะเวลาขั้นต่ำในการเก็บรักษาข้อมูล",
  "a duty to keep data for at least some period, whether the period is stated here or prescribed elsewhere":
    "หน้าที่เก็บรักษาข้อมูลไว้ไม่น้อยกว่าระยะเวลาหนึ่ง ไม่ว่าระยะเวลานั้นจะกำหนดไว้ในบทบัญญัตินี้หรือกำหนดไว้ที่อื่น",
  "a duty to preserve records or documents for a stated number of years":
    "หน้าที่เก็บรักษาบันทึกหรือเอกสารไว้เป็นเวลาไม่น้อยกว่าจำนวนปีที่กำหนด",
  "a duty to stop keeping data, or not to keep it longer than a purpose requires":
    "หน้าที่หยุดเก็บรักษาข้อมูล หรือไม่เก็บรักษาข้อมูลไว้นานเกินกว่าที่จำเป็นตามวัตถุประสงค์",
  "Minimum period of data retention requirement":
    "ข้อกำหนดระยะเวลาขั้นต่ำในการเก็บรักษาข้อมูล",
  "Data Protection Impact Assessment (DPIA) or Data Protection Officer (DPO) requirements":
    "ข้อกำหนดการประเมินผลกระทบด้านการคุ้มครองข้อมูลส่วนบุคคล (DPIA) หรือเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO)",
  "a duty to appoint or designate one or more individuals responsible for ensuring the organisation complies with its data protection obligations":
    "หน้าที่แต่งตั้งหรือกำหนดบุคคลหนึ่งคนหรือมากกว่าให้รับผิดชอบดูแลให้องค์กรปฏิบัติตามหน้าที่ด้านการคุ้มครองข้อมูลส่วนบุคคล",
  "a duty to assess the risks to personal data, or the effect on individuals, before carrying out the processing":
    "หน้าที่ประเมินความเสี่ยงต่อข้อมูลส่วนบุคคล หรือผลกระทบต่อเจ้าของข้อมูลส่วนบุคคล ก่อนดำเนินการประมวลผล",
  "DPO and DPIA OR only DPO requirement, applied to all sectors":
    "ข้อกำหนดทั้งเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคลและการประเมินผลกระทบ หรือเฉพาะเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล ที่ใช้กับทุกสาขา",
  "DPO and DPIA OR only DPO requirement, applied to a specific sector":
    "ข้อกำหนดทั้งเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคลและการประเมินผลกระทบ หรือเฉพาะเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล ที่ใช้กับสาขาใดสาขาหนึ่งโดยเฉพาะ",
  "Requirements to allow government access to personal data":
    "ข้อกำหนดให้รัฐเข้าถึงข้อมูลส่วนบุคคล",
  "a power for a public authority to obtain, access, or require the disclosure of personal data held by someone else":
    "อำนาจของพนักงานเจ้าหน้าที่ในการเรียก เข้าถึง หรือสั่งให้เปิดเผยข้อมูลส่วนบุคคลที่อยู่ในความครอบครองของผู้อื่น",
  "For any measure that allows government to access data without court orders":
    "มาตรการใดที่ให้รัฐเข้าถึงข้อมูลได้โดยไม่ต้องมีคำสั่งศาล",
  "Internet Intermediary Liability":
    "ความรับผิดของตัวกลางทางอินเทอร์เน็ต",
  "Lack of safe harbour for copyright infringements":
    "การขาดข้อยกเว้นความรับผิดของผู้ให้บริการสำหรับการละเมิดลิขสิทธิ์",
  "No intermediary liability framework in place":
    "ไม่มีกรอบความรับผิดของตัวกลาง",
  "Sectoral framework in place that limits liability for intermediaries":
    "มีกรอบรายสาขาที่จำกัดความรับผิดของตัวกลาง",
  "Horizontal framework in place that limits liability for intermediaries":
    "มีกรอบในแนวราบที่จำกัดความรับผิดของตัวกลาง",
  "Lack of safe harbour for other illegal activities":
    "การขาดข้อยกเว้นความรับผิดของผู้ให้บริการสำหรับการกระทำผิดกฎหมายอื่น",
  "User identify requirements":
    "ข้อกำหนดการพิสูจน์ตัวตนของผู้ใช้บริการ",
  "a requirement to establish who a user is before they may connect to the internet or use an online service":
    "ข้อกำหนดให้ระบุตัวตนของผู้ใช้บริการก่อนให้เชื่อมต่ออินเทอร์เน็ตหรือใช้บริการออนไลน์",
  "a requirement to record, verify or confirm the identity of the person a SIM card or mobile subscription is issued to, before the service is provided":
    "ข้อกำหนดให้บันทึก ตรวจสอบ หรือยืนยันตัวตนของผู้ที่ได้รับซิมการ์ดหรือบริการโทรศัพท์เคลื่อนที่ ก่อนเปิดให้บริการ",
  "a service provider is required to register its end-users and shall not provide a prepaid mobile service to an end-user who fails to register":
    "ผู้ให้บริการต้องลงทะเบียนผู้ใช้บริการ และต้องไม่ให้บริการโทรศัพท์เคลื่อนที่แบบเติมเงินแก่ผู้ใช้บริการที่ไม่ลงทะเบียน",
  "a service provider must keep the data of its users needed to identify each user":
    "ผู้ให้บริการต้องเก็บรักษาข้อมูลของผู้ใช้บริการเพื่อให้สามารถระบุตัวผู้ใช้บริการ",
  "User identity requirement to connect to the Internet or access online services":
    "ข้อกำหนดการพิสูจน์ตัวตนของผู้ใช้บริการเพื่อเชื่อมต่ออินเทอร์เน็ตหรือเข้าถึงบริการออนไลน์",
  "Used identity requirement for SIM registration":
    "ข้อกำหนดการพิสูจน์ตัวตนเพื่อการลงทะเบียนซิมการ์ด",
  "Monitoring requirements":
    "ข้อกำหนดการตรวจสอบติดตาม",
  "a duty to remove, block or disable access to content carried or hosted on a service":
    "หน้าที่ลบ ระงับการทำให้แพร่หลาย หรือปิดกั้นการเข้าถึงข้อมูลที่ส่งผ่านหรือเก็บไว้ในบริการ",
  "a duty to monitor, watch or keep track of what users do on a service":
    "หน้าที่ตรวจสอบ เฝ้าระวัง หรือติดตามการกระทำของผู้ใช้บริการ",
  "Any monitoring requirement (monitor the users’ activities or remove or block content)":
    "ข้อกำหนดการตรวจสอบติดตามใด (ตรวจสอบกิจกรรมของผู้ใช้บริการ หรือลบหรือปิดกั้นเนื้อหา)",
  "Any requirement to active monitoring of users’ activities without any legal obligation to remove or block the content":
    "ข้อกำหนดใดให้ตรวจสอบกิจกรรมของผู้ใช้บริการอย่างต่อเนื่อง โดยไม่มีหน้าที่ตามกฎหมายให้ลบหรือปิดกั้นเนื้อหา",
  "Content Access":
    "การเข้าถึงเนื้อหา",
  "Blocking or filtering commercial web content":
    "การปิดกั้นหรือกลั่นกรองเนื้อหาเว็บไซต์เชิงพาณิชย์",
  "a power or duty to block access to a commercial website, online service or online content -- an ordinary trading site, a marketplace, an advertisement, a streaming or gambling service. Not political content, not criminal content such as child abuse material, not age-restricted content and not defamation, none of which this indicator scores":
    "อำนาจหรือหน้าที่ในการปิดกั้นการเข้าถึงเว็บไซต์เชิงพาณิชย์ บริการออนไลน์ หรือเนื้อหาออนไลน์ เช่น เว็บไซต์ค้าขายทั่วไป ตลาดออนไลน์ โฆษณา บริการสตรีมมิงหรือการพนัน ทั้งนี้ ไม่รวมเนื้อหาทางการเมือง เนื้อหาที่เป็นความผิดอาญา เช่น สื่อลามกอนาจารเด็ก เนื้อหาที่จำกัดตามอายุ และการหมิ่นประมาท ซึ่งตัวชี้วัดนี้ไม่นับ",
  "a direction to an internet service provider to disable access to a website":
    "คำสั่งให้ผู้ให้บริการอินเทอร์เน็ตระงับการเข้าถึงเว็บไซต์",
  "a power or duty to filter, screen or restrict access to a class of commercial online content without blocking a site outright. Not political, criminal, age-restricted or defamatory content, which this indicator does not score":
    "อำนาจหรือหน้าที่ในการกลั่นกรอง คัดกรอง หรือจำกัดการเข้าถึงเนื้อหาออนไลน์เชิงพาณิชย์ประเภทใดประเภทหนึ่ง โดยไม่ปิดกั้นทั้งเว็บไซต์ ทั้งนี้ ไม่รวมเนื้อหาทางการเมือง เนื้อหาที่เป็นความผิดอาญา เนื้อหาที่จำกัดตามอายุ หรือการหมิ่นประมาท ซึ่งตัวชี้วัดนี้ไม่นับ",
  "Any blocking measure":
    "มาตรการปิดกั้นใด",
  "Any filtering measure":
    "มาตรการกลั่นกรองใด",
  "Online advertising requirements":
    "ข้อกำหนดเกี่ยวกับการโฆษณาออนไลน์",
  "a restriction on advertising online -- what may be advertised, to whom, or in what form -- apart from a requirement that advertising not be misleading":
    "ข้อจำกัดการโฆษณาทางสื่ออิเล็กทรอนิกส์หรือออนไลน์ ว่าสิ่งใดโฆษณาได้ โฆษณาแก่ผู้ใด หรือในรูปแบบใด นอกเหนือจากข้อกำหนดที่ห้ามโฆษณาอันเป็นเท็จหรือทำให้เข้าใจผิด",
  "Any restriction on online advertising":
    "ข้อจำกัดใดต่อการโฆษณาออนไลน์",
  "Licensing requirements for online content providers and applications (social media platforms, new providers, VPN, cloud services, etc.)":
    "ข้อกำหนดการอนุญาตสำหรับผู้ให้บริการเนื้อหาออนไลน์และแอปพลิเคชัน (แพลตฟอร์มสื่อสังคมออนไลน์ ผู้ให้บริการรายใหม่ VPN บริการคลาวด์ ฯลฯ)",
  "a licence to provide online content, applications or platform services that may be refused, suspended or revoked at the regulator’s discretion, or that attaches conditions to the content itself":
    "ใบอนุญาตให้บริการเนื้อหาออนไลน์ แอปพลิเคชัน หรือบริการแพลตฟอร์ม ซึ่งหน่วยงานกำกับดูแลอาจไม่อนุญาต พักใช้ หรือเพิกถอนได้ตามดุลพินิจ หรือที่กำหนดเงื่อนไขเกี่ยวกับเนื้อหา",
  "a requirement to hold a licence, permit or registration in order to provide online content, applications or platform services":
    "ข้อกำหนดให้ต้องได้รับใบอนุญาต หรือจดทะเบียน เพื่อให้บริการเนื้อหาออนไลน์ แอปพลิเคชัน หรือบริการแพลตฟอร์ม",
  "no person shall provide a content service, applications service or computer online service unless that person holds a licence":
    "ห้ามมิให้ผู้ใดให้บริการเนื้อหา บริการแอปพลิเคชัน หรือบริการคอมพิวเตอร์ออนไลน์ เว้นแต่จะได้รับใบอนุญาต",
  "Any strict licence requirement/ cases of more than one measure in category (2)":
    "ข้อกำหนดการอนุญาตที่เข้มงวดใด หรือกรณีที่มีมากกว่าหนึ่งมาตรการตามประเภท (2)",
  "Any licensing scheme":
    "ระบบการอนุญาตใด",
  "Non-technical NTMs":
    "มาตรการที่มิใช่ภาษีที่ไม่ใช่มาตรการทางเทคนิค",
  "Import ban applied to ICT goods and online services (e.g. network equipment, servers, handsets, applications, and data processing)":
    "การห้ามนำเข้าสินค้าเทคโนโลยีสารสนเทศและการสื่อสารและบริการออนไลน์ (เช่น อุปกรณ์โครงข่าย เครื่องแม่ข่าย โทรศัพท์เคลื่อนที่ แอปพลิเคชัน และการประมวลผลข้อมูล)",
  "a prohibition on importing a class of information and communications technology goods, or on supplying an online service from abroad. A ban on food, medicines, chemicals, weapons, waste, wildlife, vehicles or consumer products is a real import ban and belongs to other-import-ban":
    "การห้ามนำเข้าสินค้าเทคโนโลยีสารสนเทศและการสื่อสารประเภทใดประเภทหนึ่ง หรือห้ามให้บริการออนไลน์จากต่างประเทศ ทั้งนี้ การห้ามนำเข้าอาหาร ยา สารเคมี อาวุธ ของเสีย สัตว์ป่า ยานพาหนะ หรือสินค้าอุปโภคบริโภค เป็นการห้ามนำเข้าอย่างอื่นซึ่งจัดอยู่ในประเภทการห้ามนำเข้าอื่น",
  "the importation of telecommunications or radiocommunications equipment is prohibited":
    "ห้ามนำเข้าเครื่องโทรคมนาคมหรือเครื่องวิทยุคมนาคม",
  "no person shall import any encryption device, computer hardware or telecommunications apparatus":
    "ห้ามมิให้ผู้ใดนำเข้าอุปกรณ์เข้ารหัส ฮาร์ดแวร์คอมพิวเตอร์ หรือเครื่องโทรคมนาคม",
  "a prohibition on importing goods that are not computing, telecommunications or online goods -- food, medicines, chemicals, weapons, waste, wildlife, vehicles, consumer products":
    "การห้ามนำเข้าสินค้าที่มิใช่สินค้าคอมพิวเตอร์ โทรคมนาคม หรือออนไลน์ เช่น อาหาร ยา สารเคมี อาวุธ ของเสีย สัตว์ป่า ยานพาหนะ สินค้าอุปโภคบริโภค",
  "the Minister may impose a permanent ban on consumer goods of a particular kind":
    "รัฐมนตรีอาจประกาศห้ามนำเข้าสินค้าอุปโภคบริโภคบางชนิดเป็นการถาวร",
  "a person commits an offence if the person imports a firearm or firearm part":
    "ผู้ใดนำเข้าอาวุธปืนหรือส่วนของอาวุธปืน ผู้นั้นกระทำความผิด",
  "Ban on more than one ICT goods or digital services":
    "การห้ามสินค้าเทคโนโลยีสารสนเทศและการสื่อสารหรือบริการดิจิทัลมากกว่าหนึ่งรายการ",
  "Ban on one specific product or services":
    "การห้ามสินค้าหรือบริการเฉพาะรายการเดียว",
  "Other import restrictions on ICT goods and online services":
    "ข้อจำกัดการนำเข้าอื่นต่อสินค้าเทคโนโลยีสารสนเทศและการสื่อสารและบริการออนไลน์",
  "a quota, ceiling or other limit on how much of an ICT good or online service may be imported":
    "โควตา เพดาน หรือข้อจำกัดอื่นเกี่ยวกับปริมาณสินค้าเทคโนโลยีสารสนเทศและการสื่อสารหรือบริการออนไลน์ที่นำเข้าได้",
  "a licence, permit, authorisation, registration, labelling or import-control requirement that must be met before ICT goods or online services may be imported":
    "ใบอนุญาต การอนุญาต การจดทะเบียน การแสดงฉลาก หรือข้อกำหนดการควบคุมการนำเข้า ที่ต้องปฏิบัติก่อนนำเข้าสินค้าเทคโนโลยีสารสนเทศและการสื่อสารหรือบริการออนไลน์",
  "a quota, licence, permit or other import control on goods that are not computing, telecommunications or online goods":
    "โควตา ใบอนุญาต หรือการควบคุมการนำเข้าอื่นต่อสินค้าที่มิใช่สินค้าคอมพิวเตอร์ โทรคมนาคม หรือออนไลน์",
  "Import restrictions that potentially block trade (e.g., quotas) OR at least two measures of category (2)":
    "ข้อจำกัดการนำเข้าที่อาจกีดกันการค้า (เช่น โควตา) หรือมีอย่างน้อยสองมาตรการตามประเภท (2)",
  "Import estrictions that add regulatory compliance costs to trade in ICT goods and online services (e.g., licenses, permits, authorization, registration for ICT goods and labelling requirements and import controls)":
    "ข้อจำกัดการนำเข้าที่เพิ่มต้นทุนการปฏิบัติตามกฎระเบียบต่อการค้าสินค้าเทคโนโลยีสารสนเทศและการสื่อสารและบริการออนไลน์ (เช่น ใบอนุญาต การอนุญาต การจดทะเบียนสินค้าเทคโนโลยีสารสนเทศและการสื่อสาร ข้อกำหนดการแสดงฉลาก และการควบคุมการนำเข้า)",
  "Local content requirements":
    "ข้อกำหนดการใช้ผลิตภัณฑ์ในประเทศ",
  "a requirement to use locally made goods, locally supplied services or content produced in the economy -- a quota or minimum spend on programs made in the economy, for a broadcaster or an online streaming service -- stated for a whole sector or a broad class of goods such as telecommunications equipment. Content about a particular local area, such as local news for a region, is not local content: the requirement is about where the content is made. Nor is a duty to carry programmes supplied by the government or a public service broadcaster, which names who supplies them and not where they are made":
    "ข้อกำหนดให้ใช้สินค้าที่ผลิตในประเทศ บริการที่จัดหาในประเทศ หรือเนื้อหาที่ผลิตในราชอาณาจักร เช่น สัดส่วนหรือค่าใช้จ่ายขั้นต่ำสำหรับรายการที่ผลิตในราชอาณาจักร สำหรับผู้ประกอบกิจการโทรทัศน์หรือบริการสตรีมมิงออนไลน์ ซึ่งกำหนดไว้สำหรับทั้งสาขาหรือสินค้ากลุ่มกว้าง เช่น เครื่องโทรคมนาคม ทั้งนี้ เนื้อหาเกี่ยวกับท้องถิ่นใดท้องถิ่นหนึ่ง เช่น ข่าวท้องถิ่นสำหรับภูมิภาค ไม่ใช่เนื้อหาในประเทศ เพราะข้อกำหนดนี้เกี่ยวกับสถานที่ผลิตเนื้อหา และไม่รวมหน้าที่ออกอากาศรายการที่รัฐหรือผู้ประกอบกิจการบริการสาธารณะจัดหา ซึ่งระบุผู้จัดหามิใช่สถานที่ผลิต",
  "a broadcaster or subscription video on demand service must transmit a minimum proportion of programs produced in the economy, or spend a minimum amount on new local content":
    "ผู้ประกอบกิจการโทรทัศน์หรือบริการวิดีโอตามคำขอแบบบอกรับสมาชิกต้องออกอากาศรายการที่ผลิตในราชอาณาจักรไม่น้อยกว่าสัดส่วนที่กำหนด หรือใช้จ่ายเงินไม่น้อยกว่าจำนวนที่กำหนดสำหรับเนื้อหาใหม่ที่ผลิตในประเทศ",
  "a requirement to use locally made inputs in one named product, such as mobile handsets or set-top boxes":
    "ข้อกำหนดให้ใช้วัตถุดิบหรือชิ้นส่วนที่ผลิตในประเทศในผลิตภัณฑ์รายการใดรายการหนึ่ง เช่น โทรศัพท์เคลื่อนที่ หรือกล่องรับสัญญาณ",
  "At least one LCR at sectoral or horizontal level (i.e. HS-4 (e.g.telephony equipment)) and HS-2 levels) OR at least two LCRs of category (2)":
    "ข้อกำหนดการใช้ผลิตภัณฑ์ในประเทศอย่างน้อยหนึ่งมาตรการในระดับสาขาหรือแนวราบ (ระดับพิกัด HS 4 หลัก เช่น เครื่องโทรศัพท์ และระดับ HS 2 หลัก) หรือมีอย่างน้อยสองมาตรการตามประเภท (2)",
  "At least one LCR at product level (i.e. HS-6 and HS-8 levels (e.g. mobile phones and smartphones)":
    "ข้อกำหนดการใช้ผลิตภัณฑ์ในประเทศอย่างน้อยหนึ่งมาตรการในระดับผลิตภัณฑ์ (ระดับพิกัด HS 6 และ 8 หลัก เช่น โทรศัพท์เคลื่อนที่และสมาร์ตโฟน)",
  "Export restrictions on ICT goods and online services":
    "ข้อจำกัดการส่งออกสินค้าเทคโนโลยีสารสนเทศและการสื่อสารและบริการออนไลน์",
  "a prohibition, licence, permit or other control on exporting ICT goods or supplying online services abroad":
    "การห้าม ใบอนุญาต การอนุญาต หรือการควบคุมอื่นเกี่ยวกับการส่งออกสินค้าเทคโนโลยีสารสนเทศและการสื่อสาร หรือการให้บริการออนไลน์ไปยังต่างประเทศ",
  "a permit is required to export dual-use technology, cryptographic equipment or telecommunications apparatus":
    "ต้องได้รับอนุญาตในการส่งออกเทคโนโลยีที่ใช้ได้สองทาง อุปกรณ์เข้ารหัสลับ หรือเครื่องโทรคมนาคม",
  "a prohibition, licence or other control on exporting goods that are not computing, telecommunications or online goods -- waste, wildlife, food, medicines, chemicals, weapons, cultural property":
    "การห้าม ใบอนุญาต หรือการควบคุมอื่นเกี่ยวกับการส่งออกสินค้าที่มิใช่สินค้าคอมพิวเตอร์ โทรคมนาคม หรือออนไลน์ เช่น ของเสีย สัตว์ป่า อาหาร ยา สารเคมี อาวุธ ศิลปวัตถุและโบราณวัตถุ",
  "no person shall export hazardous or other waste except under a permit":
    "ห้ามมิให้ผู้ใดส่งออกของเสียอันตรายหรือของเสียอื่น เว้นแต่ได้รับอนุญาต",
  "a licence is required to export any scheduled species":
    "การส่งออกสัตว์ป่าชนิดที่กำหนดต้องได้รับใบอนุญาต",
  "Export restriction":
    "ข้อจำกัดการส่งออก",
  "Standards and Procedures":
    "มาตรฐานและขั้นตอน",
  "Lack of transparent technical standards":
    "การขาดความโปร่งใสของมาตรฐานทางเทคนิค",
  "a rule keeping foreign persons, firms or bodies out of the process by which technical standards are set or adopted":
    "บทบัญญัติที่กีดกันคนต่างด้าว บริษัทต่างประเทศ หรือองค์กรต่างประเทศจากกระบวนการกำหนดหรือรับรองมาตรฐานทางเทคนิค",
  "a rule allowing technical standards to be set, adopted or changed without publication, notice or an opportunity to comment":
    "บทบัญญัติที่อนุญาตให้กำหนด รับรอง หรือแก้ไขมาตรฐานทางเทคนิคได้โดยไม่ต้องประกาศ แจ้ง หรือเปิดโอกาสให้แสดงความคิดเห็น",
  "Not allowed foreigners to participate in the standard-setting bodies, OR non transparent standard-setting":
    "ไม่อนุญาตให้คนต่างด้าวเข้าร่วมในองค์กรกำหนดมาตรฐาน หรือการกำหนดมาตรฐานที่ไม่โปร่งใส",
  "Self-certification limitations for product safety (radio transmissions, EMC/EMI)":
    "ข้อจำกัดการรับรองตนเองด้านความปลอดภัยของผลิตภัณฑ์ (การแพร่คลื่นวิทยุ ความเข้ากันได้ทางแม่เหล็กไฟฟ้า EMC/EMI)",
  "a supplier's own declaration of conformity accepted as proof that a product meets safety, radio or electromagnetic compatibility requirements":
    "การยอมรับคำรับรองตนเองของผู้ผลิตหรือผู้นำเข้าว่าผลิตภัณฑ์เป็นไปตามมาตรฐาน เป็นหลักฐานว่าผลิตภัณฑ์เป็นไปตามข้อกำหนดด้านความปลอดภัย วิทยุ หรือความเข้ากันได้ทางแม่เหล็กไฟฟ้า",
  "a certificate from a conformity assessment body in another country accepted under a mutual recognition arrangement":
    "การยอมรับใบรับรองจากหน่วยตรวจสอบและรับรองในต่างประเทศภายใต้ความตกลงยอมรับร่วม",
  "Not allow SDoC and third-party certification":
    "ไม่อนุญาตให้รับรองตนเองและไม่ยอมรับการรับรองโดยบุคคลที่สาม",
  "SDoC is not allowed, but accept 3rd party-certification from CABs from a number of countries with MRA":
    "ไม่อนุญาตให้รับรองตนเอง แต่ยอมรับการรับรองโดยบุคคลที่สามจากหน่วยรับรองของประเทศที่มีความตกลงยอมรับร่วม",
  "SDoC is allowed for foreign business":
    "อนุญาตให้ผู้ประกอบการต่างประเทศรับรองตนเองได้",
  "Product screening and testing requirements":
    "ข้อกำหนดการตรวจสอบและทดสอบผลิตภัณฑ์",
  "a requirement that a product be screened, tested, inspected or type-approved before it may be sold, imported or connected to a network":
    "ข้อกำหนดให้ผลิตภัณฑ์ต้องผ่านการตรวจสอบ ทดสอบ ตรวจ หรือรับรองแบบ ก่อนจำหน่าย นำเข้า หรือเชื่อมต่อกับโครงข่าย",
  "acceptance of test results, certificates or conformity assessments issued by a body outside the economy":
    "การยอมรับผลการทดสอบ ใบรับรอง หรือผลการตรวจสอบและรับรองที่ออกโดยหน่วยงานนอกราชอาณาจักร",
  "Measure in place and used for products in scope":
    "มีมาตรการและใช้กับผลิตภัณฑ์ที่อยู่ในขอบเขต",
  "Measure in place, but acceptance of 3rd party testing results":
    "มีมาตรการ แต่ยอมรับผลการทดสอบของบุคคลที่สาม",
  "Deviation from international encryption standards (ISO, IEC, ITU, FIPS, AES, TDES, and ECC)":
    "การใช้มาตรฐานการเข้ารหัสที่แตกต่างจากมาตรฐานสากล (ISO, IEC, ITU, FIPS, AES, TDES และ ECC)",
  "a required encryption algorithm, key length or cryptographic standard set by this economy in place of an internationally agreed one":
    "อัลกอริทึมการเข้ารหัส ความยาวกุญแจ หรือมาตรฐานการเข้ารหัสลับที่ราชอาณาจักรกำหนดขึ้นเองแทนมาตรฐานที่ตกลงกันในระดับระหว่างประเทศ",
  "For any measure or known case":
    "มาตรการหรือกรณีที่ทราบใด",
  "Online Sales and Transactions":
    "การขายและธุรกรรมออนไลน์",
  "Foreign equity limits in e-commerce sector":
    "ข้อจำกัดการถือหุ้นของคนต่างด้าวในกิจการพาณิชย์อิเล็กทรอนิกส์",
  "a rule that no share of a company selling goods or services online, or operating an online marketplace, may be held by a foreign person":
    "บทบัญญัติที่ห้ามคนต่างด้าวถือหุ้นใดในบริษัทที่ขายสินค้าหรือบริการทางออนไลน์ หรือประกอบกิจการตลาดออนไลน์",
  "a limit letting a foreign person hold only a minority of a company selling online or operating an online marketplace -- half the shares or fewer, including a floor on the proportion that must be held locally":
    "ข้อจำกัดที่ให้คนต่างด้าวถือหุ้นได้เพียงส่วนน้อยในบริษัทที่ขายสินค้าทางออนไลน์หรือประกอบกิจการตลาดออนไลน์ คือ ไม่เกินกึ่งหนึ่งของหุ้นทั้งหมด รวมถึงการกำหนดสัดส่วนขั้นต่ำที่ต้องถือโดยผู้มีสัญชาติไทย",
  "a limit letting a foreign person hold more than half but not all of a company selling online or operating an online marketplace":
    "ข้อจำกัดที่ให้คนต่างด้าวถือหุ้นได้เกินกึ่งหนึ่งแต่ไม่ทั้งหมดในบริษัทที่ขายสินค้าทางออนไลน์หรือประกอบกิจการตลาดออนไลน์",
  "A minority stakes (1-50%) allowed":
    "อนุญาตให้ถือหุ้นส่วนน้อย (ร้อยละ 1-50)",
  "A controlling stake (51-99%) allowed":
    "อนุญาตให้ถือหุ้นส่วนใหญ่ที่มีอำนาจควบคุม (ร้อยละ 51-99)",
  "Full ownership (100%) allowed in e-commerce sector":
    "อนุญาตให้ถือหุ้นได้ทั้งหมด (ร้อยละ 100) ในกิจการพาณิชย์อิเล็กทรอนิกส์",
  "Online purchases and delivery limitations":
    "ข้อจำกัดการซื้อและการจัดส่งสินค้าออนไลน์",
  "a restriction on which goods or services may be bought online, or on how many of them":
    "ข้อจำกัดว่าสินค้าหรือบริการใดซื้อทางออนไลน์ได้ หรือซื้อได้ในจำนวนเท่าใด",
  "a restriction on delivering to a buyer goods that were bought online":
    "ข้อจำกัดการจัดส่งสินค้าที่ซื้อทางออนไลน์ให้แก่ผู้ซื้อ",
  "Any measure limits the number of products that can be purchases online AND restrictions to delivery of products bought online":
    "มาตรการใดที่จำกัดจำนวนสินค้าที่ซื้อทางออนไลน์ได้ และข้อจำกัดการจัดส่งสินค้าที่ซื้อทางออนไลน์",
  "Licensing scheme for e-commerce providers (B2B and B2C)":
    "ระบบการอนุญาตสำหรับผู้ประกอบการพาณิชย์อิเล็กทรอนิกส์ (B2B และ B2C)",
  "a requirement to hold a licence, permit, approval or registration in order to sell goods or services online":
    "ข้อกำหนดให้ต้องได้รับใบอนุญาต ความเห็นชอบ หรือจดทะเบียน เพื่อขายสินค้าหรือบริการทางออนไลน์",
  "Any license for e-commerce providers":
    "ใบอนุญาตใดสำหรับผู้ประกอบการพาณิชย์อิเล็กทรอนิกส์",
  "Online payment limitations: mandate local bank account":
    "ข้อจำกัดการชำระเงินออนไลน์: บังคับให้ใช้บัญชีธนาคารในประเทศ",
  "a requirement to hold or use an account with a bank established in the economy in order to take payment":
    "ข้อกำหนดให้มีหรือใช้บัญชีกับธนาคารที่จัดตั้งในราชอาณาจักรเพื่อรับชำระเงิน",
  "Requirements to use a local bank account":
    "ข้อกำหนดให้ใช้บัญชีธนาคารในประเทศ",
  "Online payment limitations: mandate currency used for international payments":
    "ข้อจำกัดการชำระเงินออนไลน์: กำหนดสกุลเงินที่ใช้ชำระเงินระหว่างประเทศ",
  "a requirement about which currency a payment to or from another country must be made in":
    "ข้อกำหนดว่าการชำระเงินไปยังหรือจากต่างประเทศต้องทำเป็นเงินสกุลใด",
  "Requirements on the currency used for international payments":
    "ข้อกำหนดเกี่ยวกับสกุลเงินที่ใช้ชำระเงินระหว่างประเทศ",
  "Online payment limitations: deviate national standards":
    "ข้อจำกัดการชำระเงินออนไลน์: มาตรฐานของประเทศที่แตกต่าง",
  "a standard for the security of electronic payments that this economy sets itself, rather than one adopted from an international body":
    "มาตรฐานความมั่นคงปลอดภัยของการชำระเงินทางอิเล็กทรอนิกส์ที่ราชอาณาจักรกำหนดขึ้นเอง แทนการรับมาตรฐานขององค์กรระหว่างประเทศ",
  "National standards for payment security that deviate from international standards":
    "มาตรฐานความมั่นคงปลอดภัยของการชำระเงินของประเทศที่แตกต่างจากมาตรฐานสากล",
  "Online payment limitations: licensing requirements":
    "ข้อจำกัดการชำระเงินออนไลน์: ข้อกำหนดการอนุญาต",
  "a requirement to hold a licence, or to be authorised, in order to provide payment services -- to carry on a banking or payment business, hold stored value or issue a payment instrument -- and the conditions that must be met to keep it":
    "ข้อกำหนดให้ต้องได้รับใบอนุญาต หรือได้รับอนุญาต เพื่อให้บริการการชำระเงิน เช่น ประกอบธุรกิจธนาคารหรือธุรกิจบริการการชำระเงิน รับเงินล่วงหน้า หรือออกเครื่องมือการชำระเงิน และเงื่อนไขที่ต้องปฏิบัติเพื่อคงใบอนุญาตไว้",
  "a requirement to be authorised, or to hold an authority or exemption, in order to hold stored value or issue a payment facility":
    "ข้อกำหนดให้ต้องได้รับอนุญาตหรือได้รับยกเว้น เพื่อรับเงินล่วงหน้าหรือออกเงินอิเล็กทรอนิกส์",
  "a requirement to hold a licence to provide payment services, and the conditions that must be met to keep it":
    "ข้อกำหนดให้ต้องได้รับใบอนุญาตเพื่อให้บริการการชำระเงิน และเงื่อนไขที่ต้องปฏิบัติเพื่อคงใบอนุญาตไว้",
  "Licensing requirements with restrictive conditions":
    "ข้อกำหนดการอนุญาตที่มีเงื่อนไขเข้มงวด",
  "Online payment limitations: ceiling on the maximum amount":
    "ข้อจำกัดการชำระเงินออนไลน์: เพดานจำนวนเงินสูงสุด",
  "a limit on the largest amount that may be paid by an electronic payment method, in one payment or over a period":
    "ข้อจำกัดจำนวนเงินสูงสุดที่ชำระได้ด้วยวิธีการชำระเงินทางอิเล็กทรอนิกส์ ต่อครั้งหรือต่อช่วงเวลา",
  "Ceilings on the maximum amount that can be paid by electronic payment methods":
    "เพดานจำนวนเงินสูงสุดที่ชำระได้ด้วยวิธีการชำระเงินทางอิเล็กทรอนิกส์",
  "Online payment limitations: mandate specific intermediaries":
    "ข้อจำกัดการชำระเงินออนไลน์: บังคับให้ใช้ตัวกลางเฉพาะ",
  "a requirement to route online payments through a named or approved intermediary, switch, gateway or clearing house":
    "ข้อกำหนดให้การชำระเงินออนไลน์ต้องผ่านตัวกลาง ระบบสวิตชิ่ง เกตเวย์ หรือสำนักหักบัญชีที่ระบุหรือได้รับอนุมัติ",
  "Requirements mandating the use of specific intermediaries for online payments":
    "ข้อกำหนดที่บังคับให้ใช้ตัวกลางเฉพาะในการชำระเงินออนไลน์",
  "Online payment limitations: others restrictions":
    "ข้อจำกัดการชำระเงินออนไลน์: ข้อจำกัดอื่น",
  "any other restriction on making or receiving payment online, apart from ones about bank accounts, currency, security standards, licensing, maximum amounts or intermediaries":
    "ข้อจำกัดอื่นใดในการชำระหรือรับชำระเงินทางออนไลน์ นอกเหนือจากเรื่องบัญชีธนาคาร สกุลเงิน มาตรฐานความมั่นคงปลอดภัย การอนุญาต จำนวนเงินสูงสุด หรือตัวกลาง",
  "Other restrictions":
    "ข้อจำกัดอื่น",
  "Low De Minimis":
    "มูลค่าขั้นต่ำที่ได้รับยกเว้นอากรต่ำ",
  "a value of imported goods at which a charge on their import is turned off or turned on -- a customs duty, an import duty, an import tax, a sales or consumption tax levied on arrival -- however the provision names it and from whichever side it states the figure: a de minimis, a relief, an exemption by value, a threshold for informal clearance, or the ceiling that defines the low-value consignments a charge applies to":
    "มูลค่าของของที่นำเข้าซึ่งเป็นเกณฑ์ยกเว้นหรือเริ่มเรียกเก็บค่าภาระในการนำเข้า เช่น อากรศุลกากร อากรขาเข้า ภาษีนำเข้า ภาษีมูลค่าเพิ่มหรือภาษีการบริโภคที่เรียกเก็บเมื่อนำเข้า ไม่ว่าบทบัญญัติจะเรียกว่าอย่างไรและกำหนดมูลค่าไว้ทางด้านใด เช่น มูลค่าขั้นต่ำ การยกเว้นอากร การยกเว้นตามมูลค่า เกณฑ์การตรวจปล่อยแบบไม่เป็นทางการ หรือเพดานที่กำหนดของที่มีมูลค่าต่ำซึ่งต้องเสียค่าภาระ",
  "goods of a value not exceeding a stated amount are exempt from import duty or sales tax":
    "ของที่มีราคาไม่เกินจำนวนที่กำหนดได้รับยกเว้นอากรขาเข้าหรือภาษี",
  "goods whose value does not exceed a stated amount are cleared without an import declaration or entry for home consumption":
    "ของที่มีราคาไม่เกินจำนวนที่กำหนดได้รับการตรวจปล่อยโดยไม่ต้องยื่นใบขนสินค้าขาเข้า",
  "No De Minimis":
    "ไม่มีมูลค่าขั้นต่ำที่ได้รับยกเว้นอากร",
  "De Minimis below < 200 USD":
    "มูลค่าขั้นต่ำที่ได้รับยกเว้นอากรต่ำกว่า 200 ดอลลาร์สหรัฐ",
  "De Minimis ≥ 200 USD":
    "มูลค่าขั้นต่ำที่ได้รับยกเว้นอากรตั้งแต่ 200 ดอลลาร์สหรัฐขึ้นไป",
  "Imposition of custom duties on electronic transmission":
    "การเรียกเก็บอากรศุลกากรจากการส่งผ่านทางอิเล็กทรอนิกส์",
  "a customs duty, tariff or import charge imposed on something delivered electronically":
    "อากรศุลกากร พิกัดอัตราศุลกากร หรือค่าภาระการนำเข้าที่เรียกเก็บจากสิ่งที่ส่งมอบทางอิเล็กทรอนิกส์",
  "a power to impose a customs duty or import charge on goods or services delivered electronically, whether or not it has been exercised":
    "อำนาจในการเรียกเก็บอากรศุลกากรหรือค่าภาระการนำเข้าจากสินค้าหรือบริการที่ส่งมอบทางอิเล็กทรอนิกส์ ไม่ว่าจะได้ใช้อำนาจนั้นแล้วหรือไม่",
  "Legal mechanisms or regulations applicable to impose custom duties on electronic transmission":
    "กลไกทางกฎหมายหรือกฎระเบียบที่ใช้เรียกเก็บอากรศุลกากรจากการส่งผ่านทางอิเล็กทรอนิกส์",
  "Domain name requirements":
    "ข้อกำหนดเกี่ยวกับชื่อโดเมน",
  "a requirement to register a domain name under the top-level domain of this economy in order to trade online, or to be present in the economy in order to apply for or hold such a domain name":
    "ข้อกำหนดให้จดทะเบียนชื่อโดเมนภายใต้โดเมนระดับบนสุดของราชอาณาจักรเพื่อค้าขายทางออนไลน์ หรือต้องมีสถานที่ตั้งในราชอาณาจักรเพื่อขอจดทะเบียนหรือถือชื่อโดเมนดังกล่าว",
  "a requirement to appoint a representative, agent or responsible person located in the economy":
    "ข้อกำหนดให้แต่งตั้งผู้แทน ตัวแทน หรือผู้รับผิดชอบที่มีถิ่นที่อยู่ในราชอาณาจักร",
  "Physical presence required, requirements to the register a local domain name to conduct electronic retail":
    "ต้องมีสถานที่ตั้งจริง หรือข้อกำหนดให้จดทะเบียนชื่อโดเมนในประเทศเพื่อประกอบธุรกิจค้าปลีกทางอิเล็กทรอนิกส์",
  "Local representative required":
    "ต้องมีผู้แทนในประเทศ",
  "Local presence requirements for online service providers":
    "ข้อกำหนดให้ผู้ให้บริการออนไลน์ต้องมีสถานที่ตั้งในประเทศ",
  "a requirement for a provider of online services to be established, incorporated, registered or physically present in the economy":
    "ข้อกำหนดให้ผู้ให้บริการออนไลน์ต้องจัดตั้ง จดทะเบียนจัดตั้ง จดทะเบียน หรือมีสถานที่ตั้งในราชอาณาจักร",
  "Local presence requirement for at least one sector":
    "ข้อกำหนดให้มีสถานที่ตั้งในประเทศในอย่างน้อยหนึ่งสาขา",
  "Lack of legal framework for online consumer protection":
    "การขาดกรอบกฎหมายคุ้มครองผู้บริโภคออนไลน์",
  "No consumer protection legal framework applicable to online commerce":
    "ไม่มีกรอบกฎหมายคุ้มครองผู้บริโภคที่ใช้กับการพาณิชย์ออนไลน์",
  "Consumer protection law applicable to online commerce":
    "กฎหมายคุ้มครองผู้บริโภคที่ใช้กับการพาณิชย์ออนไลน์",
};
