// admin/js/inventory/state.js
export const state = {
  view: 'all', // all | active | inactive | stranded | deleted
  list:   { limit: 20, offset: 0, q: '', category: '' },
  deleted:{ limit: 20, offset: 0, q: '', category: '' },
  _wired: false // guard so we don't double-wire listeners
};
