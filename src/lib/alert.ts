import { Alert as NativeAlert, type AlertButton, type AlertOptions } from 'react-native';

import { translate } from '@/lib/i18n';

/**
 * The app's Alert. Use this, not react-native's.
 *
 * Same call, but the title, the message and the button labels go through the
 * dictionary first. An alert is raised from event handlers, outside any
 * component render, so it uses the non-hook `translate`, which reads the
 * language the root layout last set.
 *
 * Text that came from the server (an error's message) has no dictionary line
 * and is shown as it arrived.
 */
export const Alert = {
  alert(
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ): void {
    NativeAlert.alert(
      translate(title),
      message === undefined ? undefined : translate(message),
      buttons?.map((b) => (b.text ? { ...b, text: translate(b.text) } : b)),
      options,
    );
  },
};
