import { useState } from 'react';

type Draft = { title: string; description: string; imageUrl: string; submittedBy: string };
type SubmitState = { status: 'idle' } | { status: 'sending' } | { status: 'sent' } | { status: 'error'; reason: string };

const EMPTY_DRAFT: Draft = { title: '', description: '', imageUrl: '', submittedBy: '' };

const WEBHOOK_URL = import.meta.env.VITE_IDEAS_WEBHOOK_URL as string | undefined;

export function Ideas() {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [state, setState] = useState<SubmitState>({ status: 'idle' });

  const field = (key: keyof Draft) => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  const canSubmit = draft.title.trim() !== '' && draft.description.trim() !== '' && draft.submittedBy.trim() !== '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || state.status === 'sending') return;
    if (WEBHOOK_URL === undefined) {
      setState({ status: 'error', reason: 'VITE_IDEAS_WEBHOOK_URL is not set (see .env.example)' });
      return;
    }
    setState({ status: 'sending' });
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.description.trim(),
          image_url: draft.imageUrl.trim(),
          submitted_by: draft.submittedBy.trim(),
        }),
      });
      if (!res.ok) {
        setState({ status: 'error', reason: `Slack returned ${res.status}` });
        return;
      }
      setState({ status: 'sent' });
      setDraft(EMPTY_DRAFT);
    } catch {
      setState({ status: 'error', reason: 'Network error reaching the webhook' });
    }
  }

  return (
    <section>
      <div className="section-head">
        <h1>Submit an idea</h1>
        <p className="muted">Posts straight to the #workshop-ideas Slack channel — comment and reply there.</p>
      </div>

      <form className="idea-form" onSubmit={submit}>
        <label>
          Title
          <input type="text" placeholder="Plinko with a side bet" {...field('title')} />
        </label>
        <label>
          Description
          <textarea rows={5} placeholder="What's the mechanic, what core does it map to, why is it fun" {...field('description')} />
        </label>
        <label>
          Concept art URL
          <input type="url" placeholder="https://…" {...field('imageUrl')} />
        </label>
        <label>
          Your Slack name
          <input type="text" placeholder="How you're listed in Slack" {...field('submittedBy')} />
        </label>

        <div className="idea-form-actions">
          <button type="submit" className="primary" disabled={!canSubmit || state.status === 'sending'}>
            {state.status === 'sending' ? 'Posting…' : 'Post to Slack'}
          </button>
          {state.status === 'sent' && <span className="idea-status ok">Posted — check the channel.</span>}
          {state.status === 'error' && <span className="idea-status err">{state.reason}</span>}
        </div>
      </form>
    </section>
  );
}
