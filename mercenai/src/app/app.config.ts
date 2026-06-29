import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { GameSyncService } from './core/game-sync.service';

function initGame(sync: GameSyncService) {
  return () => sync.init();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: initGame,
      deps: [GameSyncService],
      multi: true,
    },
  ],
};
