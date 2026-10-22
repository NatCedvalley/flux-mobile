/** `1 change`, `2 changes`. */
export function changeCount(n: number): string {
  return n === 1 ? '1 change' : `${n} changes`;
}

/** The logout alert's message while changes wait in the queue. */
export function unsentChangesMessage(n: number): string {
  return `${changeCount(n)} ${n === 1 ? 'hasn’t' : 'haven’t'} been sent. ${
    n === 1 ? 'It’ll' : 'They’ll'
  } send when you sign in to this account again.`;
}
