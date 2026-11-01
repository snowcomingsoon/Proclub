import fallbackJson from './fallback-data.json' with { type: 'json' };
import faidaFallbackJson from './faida-fallback.json' with { type: 'json' };

export const fallbackData = fallbackJson;
export const faidaFallbackData = faidaFallbackJson;

export const fallbackForClub = (clubKey = 'billocchi') =>
  clubKey === 'faida' ? faidaFallbackJson : fallbackJson;
