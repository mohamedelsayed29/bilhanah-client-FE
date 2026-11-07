import { useLanguage } from '../../../lib/language';
import './reports-showcase.css';

/**
 * Real files the visitor can download: the report template restaurants get, filled with illustrative
 * data by bilhanah-backend/scripts/website-sample-reports.mjs (output in /public/samples).
 */
export function ReportSamples() {
  const { text, language } = useLanguage();
  const other = language === 'ar' ? 'en' : 'ar';
  const file = (lang: string, ext: string) => `/samples/bilhanah-sample-report-${lang}.${ext}`;
  const name = (lang: string, ext: string) => `bilhanah-sample-report-${lang}.${ext}`;
  const includes = [
    text('صافي وإجمالي المبيعات، الطلبات، ومتوسط الطلب', 'Net and gross sales, orders and average order'),
    text('المبيعات يوم بيوم', 'Sales day by day'),
    text('أداء الفروع والأصناف الأكثر مبيعًا', 'Branch performance and top dishes'),
    text('الخصومات والمسترجع المسجّل', 'Discounts and recorded refunds'),
    text('جدول تفصيلي لكل صنف', 'A detailed table for every dish'),
  ];
  return <section id="sample" className="rep-samples" aria-labelledby="samples-title">
    <a className="rep-preview" href={file(language, 'pdf')} target="_blank" rel="noopener" aria-label={text('افتح التقرير النموذجي', 'Open the sample report')}>
      <img src={`/samples/report-preview-${language}.png`} alt={text('الصفحة الأولى من تقرير بالهنا النموذجي', 'Page one of the Bilhanah sample report')} width="636" height="900" loading="lazy" />
    </a>
    <div className="rep-samples-copy">
      <h2 id="samples-title">{text('حمّل تقرير نموذجي', 'Download a sample report')}</h2>
      <p>{text('نفس التقرير اللي بيطلع من لوحة التحكم، بنفس التصميم، ببيانات توضيحية لمطعم بفرعين خلال شهر.', 'The same report the dashboard produces, in the same design, with illustrative data for a two-branch restaurant over one month.')}</p>
      <ul className="rep-includes">{includes.map(item => <li key={item}>{item}</li>)}</ul>
      <div className="rep-downloads">
        <a className="button button-teal" href={file(language, 'pdf')} download={name(language, 'pdf')}>{text('حمّل PDF', 'Download PDF')}</a>
        <a className="button button-outline" href={file(language, 'csv')} download={name(language, 'csv')}>{text('حمّل CSV للـExcel', 'Download CSV for Excel')}</a>
      </div>
      <p className="rep-other">{text('النسخة الإنجليزي:', 'Arabic version:')} <a href={file(other, 'pdf')} download={name(other, 'pdf')}>PDF</a> · <a href={file(other, 'csv')} download={name(other, 'csv')}>CSV</a>. {text('البيانات توضيحية ومش لمطعم حقيقي.', 'The data is illustrative, not from a real restaurant.')}</p>
    </div>
  </section>;
}
