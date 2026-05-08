import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { BrainstormView } from './BrainstormView';

export function BrainstormTitlebar() {
  return <Titlebar />;
}

export function BrainstormMainPanel() {
  return <BrainstormView />;
}

export const brainstormView = {
  TitlebarSlot: BrainstormTitlebar,
  MainPanel: BrainstormMainPanel,
};
