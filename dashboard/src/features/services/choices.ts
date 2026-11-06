import { type MenuSource, missingRequirements, RESTAURANT_SERVICES, type RestaurantServiceKey, type ServiceStates } from '@bilhanah/contracts';

/** Services that only make sense with Bilhanah's menu. */
const MENU_BOUND: RestaurantServiceKey[] = ['DIGITAL_MENU', 'QR_ORDERING', 'REVIEWS'];

/** What a restaurant starts with for each answer; the owner can change any of it. */
export function defaultServices(source: MenuSource): Set<RestaurantServiceKey> {
  return new Set(RESTAURANT_SERVICES.filter(key => source === 'BILHANAH' || !MENU_BOUND.includes(key)));
}

/** Adds a service with what it needs, or removes it with what needs it. */
export function toggleService(current: Set<RestaurantServiceKey>, key: RestaurantServiceKey): Set<RestaurantServiceKey> {
  const next = new Set(current);
  const states = () => Object.fromEntries(RESTAURANT_SERVICES.map(entry => [entry, next.has(entry)])) as ServiceStates;
  if (next.has(key)) {
    next.delete(key);
    // Anything that needed it goes too (ordering and reviews without the menu).
    for (const other of RESTAURANT_SERVICES) if (missingRequirements(other, states()).length) next.delete(other);
  } else {
    for (const required of missingRequirements(key, states())) next.add(required);
    next.add(key);
  }
  return next;
}

/** The services to switch on, requirements first, for `service` to work. */
export function servicesToEnable(service: RestaurantServiceKey, isOn: (key: RestaurantServiceKey) => boolean): RestaurantServiceKey[] {
  const states = Object.fromEntries(RESTAURANT_SERVICES.map(key => [key, isOn(key)])) as ServiceStates;
  const chain = [...missingRequirements(service, states), ...(states[service] ? [] : [service])];
  return chain.filter((key, index) => chain.indexOf(key) === index);
}
