/** Shape every form action returns to `useActionState`. Safe to import on the client. */
export type FormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echo of submitted (non-password) values so the form keeps them after an error. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { ok: false };
