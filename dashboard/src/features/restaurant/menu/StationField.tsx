import { useQuery } from '@tanstack/react-query';
import { Field } from '../../../components/Field';
import { kitchenStationsApi } from '../../../lib/api/endpoints';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../queries';

/**
 * Which kitchen station prepares a category's (or one dish's) orders. `inheritLabel` names what an
 * empty choice means: the default station for a category, the category's station for a dish.
 */
export function StationField({ value, onChange, inheritLabel, hint }: { value: string | null; onChange: (stationId: string | null) => void; inheritLabel: string; hint: string }) {
  const { text } = useLanguage();
  const stations = useQuery({ queryKey: queryKeys.kitchenStations, queryFn: kitchenStationsApi.list, staleTime: 60_000 });
  const list = stations.data?.stations ?? [];
  return <Field label={text('محطة التحضير', 'Kitchen station')} hint={hint}>
    <select className="select" value={value ?? ''} onChange={event => onChange(event.target.value || null)} disabled={!stations.data} data-testid="station-select">
      <option value="">{inheritLabel}</option>
      {list.map(station => <option key={station.id} value={station.id}>
        {text(station.nameAr, station.nameEn ?? station.nameAr)}{station.isActive ? '' : text(' (موقوفة)', ' (off)')}
      </option>)}
    </select>
  </Field>;
}
