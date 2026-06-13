-- Credit-only cart checkout omitted paid=true; wallet was debited but roster showed Unpaid.
UPDATE public.session_participants
SET paid = true
WHERE paid = false
  AND payment_method = 'credit'
  AND COALESCE(amount_paid, 0) > 0;
