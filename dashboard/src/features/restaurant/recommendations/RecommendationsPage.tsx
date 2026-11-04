import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightIcon, CoinsIcon, PencilSimpleIcon, PercentIcon, PlusIcon, ShoppingCartIcon, SparkleIcon, TrashIcon } from '@phosphor-icons/react';
import type { RecommendationRule } from '@bilhanah/contracts';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { ErrorPanel } from '../../../components/ErrorBoundary';
import { PageHeader } from '../../../components/PageHeader';
import { PageSkeleton } from '../../../components/Skeleton';
import { Switch } from '../../../components/Switch';
import { useToast } from '../../../components/Toast';
import { recommendationsApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { formatPrice } from '../../../lib/format';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { queryKeys, useMenuQuery } from '../queries';
import { RecommendationDialog } from './RecommendationDialog';
import { PLACEMENT_LABELS, TYPE_LABELS } from './recommendation-labels';

const PERIODS = [7, 30, 90] as const;

/**
 * Upselling and cross-selling: how suggestions perform (conversion, revenue, order value with and
 * without them), and the rules themselves, to add, edit, switch on or off, and delete.
 */
export function RecommendationsPage() {
  const { text, number, language } = useLanguage();
  usePageTitle('الترشيحات', 'Recommendations');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [editing, setEditing] = useState<RecommendationRule | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RecommendationRule | null>(null);
  const menu = useMenuQuery();
  const rules = useQuery({ queryKey: queryKeys.recommendations, queryFn: recommendationsApi.list });
  const stats = useQuery({ queryKey: queryKeys.recommendationStats(days), queryFn: () => recommendationsApi.stats(days) });
  const toggle = useMutation({
    mutationFn: (rule: RecommendationRule) => recommendationsApi.update(rule.id, { isActive: !rule.isActive }),
    onSuccess: rule => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.recommendations });
      toast.success(rule.isActive ? text('الترشيح اشتغل', 'Recommendation on') : text('الترشيح اتقفل', 'Recommendation off'));
    },
    onError: error => toast.error(errorMessage(error, text)),
  });
  const remove = useMutation({
    mutationFn: (rule: RecommendationRule) => recommendationsApi.remove(rule.id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.recommendations }); toast.success(text('اتمسح الترشيح', 'Recommendation deleted')); },
    onError: error => toast.error(errorMessage(error, text)),
  });

  if (menu.isPending || rules.isPending) return <PageSkeleton blocks={3} />;
  if (menu.isError || rules.isError) return <div className="page"><ErrorPanel error={menu.error ?? rules.error} onRetry={() => { void menu.refetch(); void rules.refetch(); }} /></div>;
  const items = new Map(menu.data.categories.flatMap(category => category.items).map(item => [item.id, item]));
  const name = (itemId: string) => { const item = items.get(itemId); return item ? text(item.nameAr, item.nameEn ?? item.nameAr) : text('صنف اتمسح', 'Deleted dish'); };
  const price = (piastres: number | null | undefined) => (piastres === null || piastres === undefined ? '—' : formatPrice(piastres, language));
  const percent = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${number(Math.round(value * 1000) / 10)}${text('٪', '%')}`);
  const s = stats.data;
  const uplift = s?.averageOrderWithPiastres != null && s.averageOrderWithoutPiastres ? s.averageOrderWithPiastres / s.averageOrderWithoutPiastres - 1 : null;
  const metrics = [
    { key: 'conversion', icon: PercentIcon, value: percent(s?.conversionRate), label: text('نسبة التحويل', 'Conversion rate'), note: s ? text(`${number(s.purchases)} شراء من ${number(s.impressions)} مشاهدة`, `${s.purchases} purchases from ${s.impressions} views`) : '' },
    { key: 'revenue', icon: CoinsIcon, value: price(s?.revenuePiastres), label: text('إيراد من الترشيحات', 'Revenue from suggestions'), note: s ? text(`${number(s.adds)} إضافة للسلة`, `${s.adds} added to carts`) : '' },
    { key: 'aov', icon: ShoppingCartIcon, value: price(s?.averageOrderPiastres), label: text('متوسط قيمة الطلب', 'Average order value'), note: s ? text(`بترشيح ${price(s.averageOrderWithPiastres)} · من غير ${price(s.averageOrderWithoutPiastres)}`, `With ${price(s.averageOrderWithPiastres)} · without ${price(s.averageOrderWithoutPiastres)}`) : '' },
    { key: 'uplift', icon: SparkleIcon, value: uplift === null ? '—' : `${uplift >= 0 ? '+' : ''}${percent(uplift)}`, label: text('زيادة قيمة الطلب', 'Order value uplift'), note: text('طلبات فيها ترشيح مقارنة بالباقي', 'Orders with a suggestion vs the rest') },
  ];
  const ruleStats = (ruleId: string) => s?.rules.find(entry => entry.ruleId === ruleId);

  return <div className="page recommendations-page">
    <PageHeader title={text('الترشيحات', 'Recommendations')}
      description={text('اقترح على الزبون أصناف تكمّل طلبه: مشروب مع الوجبة، إضافة، حجم أكبر، أو بديل لو الصنف خلص.', 'Suggest dishes that complete the order: a drink with a meal, an add-on, a bigger size, or an alternative when a dish is sold out.')}
      actions={<Button onClick={() => setEditing('new')} disabled={items.size < 2} icon={<PlusIcon size={18} aria-hidden="true" />}>{text('ترشيح جديد', 'New recommendation')}</Button>} />

    <div className="recommendations-period" role="group" aria-label={text('الفترة', 'Period')}>
      {PERIODS.map(value => <button key={value} type="button" className="chip" aria-pressed={days === value} onClick={() => setDays(value)}>{text(`آخر ${number(value)} يوم`, `Last ${value} days`)}</button>)}
    </div>
    <ul className="tables-summary recommendation-metrics" aria-label={text('أداء الترشيحات', 'Recommendation performance')}>
      {metrics.map(metric => <li key={metric.key} className={`tables-summary-card is-${metric.key}`} data-testid={`recommendation-metric-${metric.key}`}>
        <span className="tables-summary-icon" aria-hidden="true"><metric.icon size={22} weight="fill" /></span>
        <span className="tables-summary-body"><strong>{metric.value}</strong></span>
        <small>{metric.label}{metric.note && <><br />{metric.note}</>}</small>
      </li>)}
    </ul>

    <section className="section" aria-labelledby="rules-title">
      <div className="section-head"><h2 id="rules-title">{text('الترشيحات', 'Rules')}</h2><p>{text(`${number(rules.data.length)} ترشيح`, `${rules.data.length} rules`)}</p></div>
      {rules.data.length === 0
        ? <div className="card empty-state">
          <span className="empty-state-icon" aria-hidden="true"><SparkleIcon size={30} /></span>
          <h3>{text('لسه مفيش ترشيحات', 'No recommendations yet')}</h3>
          <p>{text('ابدأ بأكتر صنف بيتطلب عندك، ورشّح معاه مشروب أو حلو.', 'Start with your best seller and suggest a drink or a dessert with it.')}</p>
          <Button onClick={() => setEditing('new')} disabled={items.size < 2} icon={<PlusIcon size={18} aria-hidden="true" />}>{text('ترشيح جديد', 'New recommendation')}</Button>
        </div>
        : <ul className="recommendation-rules">
          {rules.data.map(rule => {
            const type = TYPE_LABELS[rule.type];
            const funnel = ruleStats(rule.id);
            return <li key={rule.id} className={`card recommendation-rule ${rule.isActive ? '' : 'is-off'}`} data-testid="recommendation-rule" data-source={name(rule.sourceItemId)}>
              <div className="recommendation-rule-head">
                <span className={`recommendation-type-badge is-${rule.type.toLowerCase()}`}>{text(type.ar, type.en)}</span>
                {rule.required && <span className="recommendation-required">{text('إجباري', 'Required')}</span>}
                <Switch className="recommendation-switch" checked={rule.isActive} disabled={toggle.isPending} onChange={() => toggle.mutate(rule)}
                  label={text(`ترشيحات ${name(rule.sourceItemId)}`, `${name(rule.sourceItemId)} suggestions`)} description={rule.isActive ? text('شغّال', 'On') : text('مقفول', 'Off')} />
              </div>
              <p className="recommendation-rule-flow">
                <strong><bdi>{name(rule.sourceItemId)}</bdi></strong>
                <ArrowRightIcon size={16} className="directional" aria-hidden="true" />
                <span>{rule.items.map(entry => name(entry.itemId)).join(text('، ', ', '))}</span>
              </p>
              {rule.title && <p className="muted recommendation-rule-title">«<bdi>{rule.title}</bdi>»</p>}
              <ul className="recommendation-placements" aria-label={text('بيظهر في', 'Shown in')}>
                {rule.placements.map(placement => <li key={placement}>{text(PLACEMENT_LABELS[placement].ar, PLACEMENT_LABELS[placement].en)}</li>)}
              </ul>
              <dl className="recommendation-rule-stats">
                <div><dt>{text('مشاهدات', 'Views')}</dt><dd>{number(funnel?.impressions ?? 0)}</dd></div>
                <div><dt>{text('إضافات', 'Adds')}</dt><dd>{number(funnel?.adds ?? 0)}</dd></div>
                <div><dt>{text('مشتريات', 'Purchases')}</dt><dd>{number(funnel?.purchases ?? 0)}</dd></div>
                <div><dt>{text('التحويل', 'Conversion')}</dt><dd>{percent(funnel?.conversionRate)}</dd></div>
                <div><dt>{text('الإيراد', 'Revenue')}</dt><dd>{price(funnel?.revenuePiastres ?? 0)}</dd></div>
              </dl>
              <div className="recommendation-rule-actions">
                <Button small variant="secondary" onClick={() => setEditing(rule)} icon={<PencilSimpleIcon size={15} aria-hidden="true" />}>{text('تعديل', 'Edit')}</Button>
                <button type="button" className="icon-button icon-button-danger" onClick={() => setDeleting(rule)} aria-label={text(`امسح ترشيحات ${name(rule.sourceItemId)}`, `Delete ${name(rule.sourceItemId)} suggestions`)}><TrashIcon size={17} /></button>
              </div>
            </li>;
          })}
        </ul>}
    </section>

    <RecommendationDialog open={editing !== null} rule={editing === 'new' ? null : editing} categories={menu.data.categories} onClose={() => setEditing(null)} />
    <ConfirmDialog open={deleting !== null} busy={remove.isPending} onCancel={() => setDeleting(null)}
      title={text(`امسح ترشيحات «${deleting ? name(deleting.sourceItemId) : ''}»؟`, `Delete “${deleting ? name(deleting.sourceItemId) : ''}” suggestions?`)}
      description={text('مش هتظهر للزباين تاني. الطلبات القديمة مش هتتأثر.', 'Diners will no longer see them. Past orders are not affected.')}
      confirmLabel={text('امسح', 'Delete')}
      onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })} />
  </div>;
}
