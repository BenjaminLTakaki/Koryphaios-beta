import { BrainstormStore } from '@renderer/features/brainstorm/brainstorm-store';
import { ProjectManagerStore } from '@renderer/features/projects/stores/project-manager';
import { SidebarStore } from '@renderer/features/sidebar/sidebar-store';
import { DependenciesStore } from './dependencies-store';
import { NavigationStore } from './navigation-store';
import { snapshotRegistry, type SnapshotRegistry } from './snapshot-registry';
import { SshConnectionStore } from './ssh-connection-store';
import { UpdateStore } from './update-store';

class AppState {
  readonly update: UpdateStore;
  readonly projects: ProjectManagerStore;
  readonly sidebar: SidebarStore;
  readonly snapshots: SnapshotRegistry;
  readonly navigation: NavigationStore;
  readonly dependencies: DependenciesStore;
  readonly sshConnections: SshConnectionStore;
  readonly brainstorm: BrainstormStore;

  constructor() {
    this.snapshots = snapshotRegistry;
    this.brainstorm = new BrainstormStore();
    this.update = new UpdateStore();
    this.projects = new ProjectManagerStore();
    this.sidebar = new SidebarStore(this.projects);
    this.navigation = new NavigationStore();
    this.dependencies = new DependenciesStore();
    this.sshConnections = new SshConnectionStore({
      onConnectionReady: (connectionId) => void this.dependencies.refreshAgents(connectionId),
    });
    snapshotRegistry.register('navigation', () => this.navigation.snapshot);
    snapshotRegistry.register('sidebar', () => this.sidebar.snapshot);
    snapshotRegistry.register('brainstorm', () => this.brainstorm.snapshot);
    this.dependencies.start();
    this.sshConnections.start();
  }
}

export const appState = new AppState();

// Re-export for callers that previously imported sidebarStore from sidebar-store.ts.
export const sidebarStore = appState.sidebar;
