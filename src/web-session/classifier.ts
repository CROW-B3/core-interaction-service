import type { PreprocessedSession, SessionLayer } from './agents/types';

export function classifySession(session: PreprocessedSession): SessionLayer {
  if (isDeadSession(session)) return 'dead';
  if (isDeterministicSession(session)) return 'deterministic';
  return 'behavioral';
}

function isDeadSession(session: PreprocessedSession): boolean {
  const hasMinimalEvents = session.totalEventCount <= 3;
  const isShortDuration = session.durationMs < 10_000;

  const interactiveTypes = new Set([
    'click',
    'form',
    'add_to_cart',
    'variant_select',
    'image_zoom',
    'rage_click',
  ]);
  const hasNoInteractions = !Object.keys(session.eventCounts).some(type =>
    interactiveTypes.has(type)
  );

  return hasMinimalEvents && isShortDuration && hasNoInteractions;
}

function isDeterministicSession(session: PreprocessedSession): boolean {
  if (session.errors.length > 0) return true;
  if (session.rageClicks.length > 0) return true;
  if (
    session.apiErrors.some(e => {
      const status = Number(e.data?.statusCode);
      return status >= 400;
    })
  )
    return true;

  const { lcp, cls } = session.performance;
  if (lcp !== undefined && lcp > 4000) return true;
  if (cls !== undefined && cls > 0.25) return true;

  return false;
}
