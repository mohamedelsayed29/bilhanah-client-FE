import { ArrowLeftIcon, ContactlessPaymentIcon, QrCodeIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';
import { useLanguage } from '../../../lib/language';
import './nfc-stands.css';

export function NfcStands() {
  const { text } = useLanguage();
  return <section id="nfc-stands" className="nfc-section page-container section-space" aria-labelledby="nfc-title">
    <div className="nfc-visual">
      <figure className="nfc-table-photo">
        <img src="/media/nfc-acrylic-table-v1.jpg" width="1536" height="1024" loading="lazy" decoding="async" alt={text('تصوّر لحامل أكريليك شفاف من بالهنا، عليه QR وعلامة NFC، على ترابيزة مطعم بجوار طبق باستا.', 'Illustrative Bilhanah clear acrylic stand with a QR code and NFC symbol on a restaurant table beside a pasta dish.')} />
        <figcaption><QrCodeIcon size={17} aria-hidden="true" /><span dir="ltr">QR + NFC</span></figcaption>
      </figure>
      <figure className="nfc-detail-photo">
        <img src="/media/nfc-acrylic-detail-v1.jpg" width="880" height="1100" loading="lazy" decoding="async" alt={text('تصوّر مقرّب للحامل يوضح حواف الأكريليك الشفافة، القاعدة، والـQR مع علامة اللمس NFC.', 'Illustrative close-up of the stand showing polished clear acrylic edges, the base, QR code and NFC tap symbol.')} />
        <figcaption>{text('أكريليك شفاف. تفاصيل تليق بمطعمك.', 'Clear acrylic. A thoughtful table detail.')}</figcaption>
      </figure>
    </div>
    <div className="nfc-copy">
      <h2 id="nfc-title">{text('حوامل QR وNFC للترابيزة', 'QR & NFC table stands')}</h2>
      <p className="nfc-intro">{text('حوامل أكريليك شفافة عليها QR مطبوع، ومعاها شريحة NFC لو حبيت. الزبون يفتح منيو مطعمك بالكاميرا أو بلمسة موبايل، من غير ما ينزّل تطبيق.', 'Clear acrylic stands with a printed QR code, and an NFC chip if you want one. Guests open your menu with the camera or a tap of the phone. No app to download.')}</p>
      <dl className="nfc-methods">
        <div><dt><QrCodeIcon size={24} aria-hidden="true" /><span>{text('سكان بالكاميرا', 'Scan with the camera')}</span></dt><dd>{text('يوجّه كاميرا الموبايل للـQR، ويفتح منيو مطعمك مباشرة.', 'Point the phone’s camera at the QR code to open your restaurant’s menu.')}</dd></div>
        <div><dt><ContactlessPaymentIcon size={25} aria-hidden="true" /><span>{text('أضف اللمس بـNFC', 'Add NFC tap')}</span></dt><dd>{text('يقرّب الموبايل من علامة NFC على الحامل، ويضغط على اللينك اللي يظهر له.', 'Hold the phone near the stand’s NFC symbol, then tap the link that appears.')}</dd></div>
      </dl>
      <div className="nfc-shopping-actions"><Link className="button button-teal nfc-contact" to="/shop">{text('صمّم حاملك واطلبه', 'Design your stand')}<ArrowLeftIcon size={18} className="directional-arrow" aria-hidden="true" /></Link><Link className="text-link" to="/contact?topic=nfc">{text('اسأل عن حامل مطعمك', 'Ask about your table stands')}</Link></div>
      <p className="nfc-support-note">{text('اللمس يحتاج موبايل يدعم NFC مع تفعيله. والـQR متاح للسكان بالكاميرا.', 'Tap requires a compatible phone with NFC enabled. Guests can also scan the QR code with their camera.')}</p>
    </div>
    <p className="nfc-image-note">{text('الصور تصوّر توضيحي للمنتج.', 'Images are illustrative product concepts.')}</p>
  </section>;
}
