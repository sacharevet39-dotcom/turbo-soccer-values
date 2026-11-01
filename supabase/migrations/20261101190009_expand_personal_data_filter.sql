create or replace function trade_chat_private.validate_community_trade_text(p_body text)
returns void
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_body = '' then
    return;
  end if;

  if v_body ~* '(^|[^[:alnum:]])(fuck(ing|er|ers)?|shit(ty|head)?|bitch(es)?|asshole|bastard|dickhead|cunt|retard(ed)?|motherfucker|putain|merde|connard(e|s)?|salope|encul[eé]|fils? de pute)([^[:alnum:]]|$)' then
    raise exception 'Please keep the chat friendly. Insults are not allowed.' using errcode = '22023';
  end if;

  if v_body ~* '([[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,})|(https?://|www[.]|discord[.]gg/|t[.]me/|wa[.]me/)|(\+?[0-9][0-9() .-]{5,}[0-9])|(my (full name|real name|address|phone|number|email|school|location|age)|my name is|i live at|mon nom complet|mon adresse|mon num[eé]ro|mon téléphone|mon collège|mon lycée|j''habite)|(\d{1,6}\s+[[:alpha:]0-9 .''-]{2,30}\s+(street|st|road|rd|avenue|ave|boulevard|blvd|rue|route|chemin))' then
    raise exception 'For your safety, do not share personal details, phone numbers, email addresses, or links.' using errcode = '22023';
  end if;

  if v_body ~* '(^|[^[:alnum:]])(robux|paypal|cash ?app|venmo|real money|real[- ]world money|money for items|sell(ing)? for cash|buy(ing)? for cash)([^[:alnum:]]|$)' then
    raise exception 'Robux and real-money trades are not allowed. Trade Turbo Soccer items in game only.' using errcode = '22023';
  end if;
end;
$function$;

revoke all on function trade_chat_private.validate_community_trade_text(text) from public, anon, authenticated;
