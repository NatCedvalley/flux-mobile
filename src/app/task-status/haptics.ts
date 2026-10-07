import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * A light (a swipe action revealed) or medium (an action committed) tap.
 * Native only, and a failure is never worth surfacing.
 */
export async function impact(weight: 'light' | 'medium'): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }
  try {
    await Haptics.impact({
      style: weight === 'light' ? ImpactStyle.Light : ImpactStyle.Medium,
    });
  } catch (error) {
    console.error('Haptics failed', error);
  }
}
