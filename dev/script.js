// Dev console configuration.
// To add an endpoint: add an entry to the relevant scene's `endpoints` array.
// To add a scene:    add a new entry to the `scenes` array with a `showWhen` condition.

window.DEV_STATE = {
  accessToken:  null,  // JWT access token — set by any login onSuccess
  refreshToken: null,  // JWT refresh token — set by any login onSuccess
  id:           null,  // user id — set by any login onSuccess
  provider:     null,  // 'guest' | 'dev' | social provider — set by any login onSuccess
  providerId:   null,  // set by any login onSuccess
  displayName:  null,  // set by any login onSuccess
  matchId:      null,  // shared match ID — set by create-match onSuccess, pre-fills related inputs
};

window.DEV_CONFIG = {
  scenes: [

    // ── Login ──────────────────────────────────────────────────────────────
    {
      id: 'login',
      label: 'Login',
      showWhen: (s) => !s.accessToken,
      endpoints: [
        {
          id: 'dev-login',
          label: 'Dev login (JWT)',
          method: 'POST',
          path: '/v1/auth/dev',
          noAuth: true,
          inputs: [
            { key: 'accountId', label: 'Account ID', placeholder: 'any string — creates user if needed' },
          ],
          body: (inputs) => ({ accountId: inputs.accountId }),
          onSuccess: (data, _state, setState) => setState({ accessToken: data.accessToken, refreshToken: data.refreshToken, id: data.id, guestId: null, provider: data.provider, providerId: data.providerId, displayName: data.displayName }),
        },
        {
          id: 'refresh',
          label: 'Refresh token',
          method: 'POST',
          path: '/v1/auth/refresh',
          noAuth: true,
          inputs: [
            { key: 'refreshToken', label: 'Refresh token', from: 'refreshToken', placeholder: 'no cached refresh token found' },
          ],
          body: (inputs) => ({ refreshToken: inputs.refreshToken }),
          onSuccess: (data, _state, setState) => setState({ accessToken: data.accessToken, refreshToken: data.refreshToken, id: data.id, provider: data.provider, providerId: data.providerId, displayName: data.displayName }),
        },
        {
          id: 'guest-login',
          label: 'Guest login',
          method: 'POST',
          path: '/v1/auth/guest',
          noAuth: true,
          inputs: [
            { key: 'guestId', label: 'Guest UUID', placeholder: 'leave empty to auto-generate' },
          ],
          body: (inputs) => ({ guestId: inputs.guestId.trim() || uuid4() }),
          onSuccess: (data, _state, setState) => setState({ accessToken: data.accessToken, refreshToken: data.refreshToken, id: data.id, provider: data.provider, providerId: data.providerId, displayName: data.displayName }),
        },
      ],
    },

    // ── Config ─────────────────────────────────────────────────────────────
    {
      id: 'config',
      label: 'Config',
      showWhen: (s) => !!s.accessToken,
      endpoints: [
        {
          id: 'get-config',
          label: 'App config',
          method: 'GET',
          path: '/v1/config',
          noAuth: true,
        },
      ],
    },

    // ── Matches ────────────────────────────────────────────────────────────
    {
      id: 'matches',
      label: 'Matches',
      showWhen: (s) => !!s.accessToken,
      endpoints: [
        {
          id: 'list-matches',
          label: 'List active matches',
          method: 'GET',
          path: '/v1/matches',
        },
        {
          id: 'create-match',
          label: 'Create match',
          method: 'POST',
          path: '/v1/matches',
          inputs: [
            { key: 'gameSlug',   label: 'Game slug',   placeholder: 'tictactoe' },
            { key: 'playerSlot', label: 'Player slot', type: 'select', options: [
              { value: '1', label: '1 — goes first' },
              { value: '2', label: '2 — goes second' },
            ]},
          ],
          body: (inputs) => ({ gameSlug: inputs.gameSlug, playerSlot: parseInt(inputs.playerSlot, 10) }),
          onSuccess: (data, _state, setState) => setState({ matchId: data.id }),
        },
        {
          id: 'get-match',
          label: 'Get match',
          method: 'GET',
          path: (inputs) => `/v1/matches/${inputs.matchId}`,
          inputs: [
            { key: 'matchId', label: 'Match ID', from: 'matchId' },
          ],
        },
        {
          id: 'join-match',
          label: 'Join match',
          method: 'POST',
          path: '/v1/matches/join',
          inputs: [
            { key: 'inviteCode', label: 'Invite code', placeholder: '4-char code' },
          ],
          body: (inputs) => ({ inviteCode: inputs.inviteCode }),
        },
        {
          id: 'get-invite',
          label: 'Get invite link',
          method: 'GET',
          path: (inputs) => `/v1/matches/${inputs.matchId}/invite`,
          inputs: [
            { key: 'matchId', label: 'Match ID', from: 'matchId' },
          ],
        },
        {
          id: 'abandon-match',
          label: 'Abandon match',
          method: 'DELETE',
          path: (inputs) => `/v1/matches/${inputs.matchId}`,
          inputs: [
            { key: 'matchId', label: 'Match ID', from: 'matchId' },
          ],
        },
      ],
    },

    // ── Actions ──────────────────────────────────────────────────────────────
    {
      id: 'actions',
      label: 'Moves',
      showWhen: (s) => !!s.accessToken,
      endpoints: [
        {
          id: 'submit-action',
          label: 'Submit action',
          method: 'POST',
          path: (inputs) => `/v1/matches/action`,
          inputs: [
            { key: 'matchId', label: 'Match ID',           from: 'matchId' },
            { key: 'action',    label: 'Move payload (JSON)', type: 'textarea', placeholder: '{"position": 0}' },
          ],
          body: (inputs) => {
            let action;
            try { action = JSON.parse(inputs.action); }
            catch { throw new Error('Invalid JSON in move payload'); }
            return { matchId: inputs.matchId, action };
          },
        },
      ],
    },

    // ── Cheats ─────────────────────────────────────────────────────────
    {
      id: 'cheats',
      label: 'Dev Endpoints',
      showWhen: (s) => !!s.accessToken,
      endpoints: [
        {
          id: 'force-complete',
          label: 'Force complete match',
          method: 'POST',
          path: (inputs) => `/v1/dev/matches/${inputs.matchId}/force-complete`,
          inputs: [
            { key: 'matchId', label: 'Match ID', from: 'matchId' },
            { key: 'winner',  label: 'Winner',   type: 'select', options: [
              { value: '0', label: '0 — draw' },
              { value: '1', label: '1 — player 1' },
              { value: '2', label: '2 — player 2' },
            ]},
          ],
          body: (inputs) => ({ winner: parseInt(inputs.winner, 10) }),
        },
      ],
    },

    // ── WebSocket ──────────────────────────────────────────────────────────
    {
      id: 'ws',
      label: 'WebSocket',
      showWhen: (s) => !!s.accessToken,
      note: 'Flow: POST /v1/auth/ws-ticket → connect to wss://&lt;host&gt;/v1/matches/:id/ws?ticket=&lt;ticket&gt;. ' +
            'Events in: move. Events out: state, move_error, match_over, opponent_connected, opponent_disconnected.',
      endpoints: [],
      // TODO: add ws-ticket request, connect/disconnect, send-move
    },

  ],
};
