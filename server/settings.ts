import { q } from "./db.ts";
import type { PricingSettings } from "../shared/rules.ts";

export interface AppSettings extends PricingSettings {
  serviceable_pins: string[];
  order_cutoff_hour: number;
  no_delivery_weekdays: number[];
  cancel_allowed_until: "paid" | "packing";
  support_phone: string;
  support_whatsapp: string;
}

const DEFAULTS: AppSettings = {
  min_order_paise: 100000,
  free_delivery_paise: 300000,
  premium_paise: 500000,
  delivery_fee_paise: 6000,
  serviceable_pins: ["600"],
  order_cutoff_hour: 20,
  no_delivery_weekdays: [0],
  cancel_allowed_until: "paid",
  support_phone: "",
  support_whatsapp: "",
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await q<{ key: string; value: unknown }>("SELECT key, value FROM settings");
  const out: any = { ...DEFAULTS };
  for (const r of rows) if (r.key in DEFAULTS) out[r.key] = r.value;
  return out as AppSettings;
}

/** The subset of settings that is safe to show to resellers. */
export function publicSettings(s: AppSettings) {
  return {
    min_order_paise: s.min_order_paise,
    free_delivery_paise: s.free_delivery_paise,
    premium_paise: s.premium_paise,
    delivery_fee_paise: s.delivery_fee_paise,
    support_phone: s.support_phone,
    support_whatsapp: s.support_whatsapp,
    cancel_allowed_until: s.cancel_allowed_until,
    order_cutoff_hour: s.order_cutoff_hour,
    no_delivery_weekdays: s.no_delivery_weekdays,
  };
}
