import { useEffect, useState } from 'react';
import type { PublicPlan } from '@bilhanah/contracts';
import { API_URL } from '../../../lib/config';
import { plans as staticPlans } from '../data/plans';
import type { Plan } from '../data/plans';

// One request per page load, shared by every component that shows prices.
let livePrices: Promise<Map<string, number>> | null = null;

function loadPrices(): Promise<Map<string, number>> {
  livePrices ??= fetch(`${API_URL}/v1/public/plans`)
    .then(response => (response.ok ? response.json() as Promise<PublicPlan[]> : []))
    .then(list => new Map(list.map(plan => [plan.code.toLowerCase(), plan.priceMonthlyPiastres / 100])))
    .catch(() => new Map());
  return livePrices;
}

/** The plan copy from data/plans, with current prices from the API when it is reachable. */
export function usePlans(): Plan[] {
  const [plans, setPlans] = useState(staticPlans);
  useEffect(() => {
    let active = true;
    loadPrices().then(prices => {
      if (active && prices.size) setPlans(staticPlans.map(plan => ({ ...plan, price: prices.get(plan.id) ?? plan.price })));
    });
    return () => { active = false; };
  }, []);
  return plans;
}
