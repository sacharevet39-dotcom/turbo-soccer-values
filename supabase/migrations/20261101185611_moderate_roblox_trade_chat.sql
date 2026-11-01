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

  if v_body ~* '([[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,})|(https?://|www[.]|discord[.]gg/|t[.]me/|wa[.]me/)|(\+?[0-9][0-9() .-]{5,}[0-9])|(my address|my phone|my number|mon adresse|mon téléphone|mon numero)' then
    raise exception 'For your safety, do not share personal details, phone numbers, email addresses, or links.' using errcode = '22023';
  end if;

  if v_body ~* '(^|[^[:alnum:]])(robux|paypal|cash ?app|venmo|real money|real[- ]world money|money for items|sell(ing)? for cash|buy(ing)? for cash)([^[:alnum:]]|$)' then
    raise exception 'Robux and real-money trades are not allowed. Trade Turbo Soccer items in game only.' using errcode = '22023';
  end if;
end;
$function$;

revoke all on function trade_chat_private.validate_community_trade_text(text) from public, anon, authenticated;

create or replace function trade_chat_private.enforce_community_trade_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_table_name = 'trade_chat_messages' then
    perform trade_chat_private.validate_community_trade_text(new.body);
  elsif tg_table_name = 'trade_listings' then
    perform trade_chat_private.validate_community_trade_text(new.message);
  end if;
  return new;
end;
$function$;

revoke all on function trade_chat_private.enforce_community_trade_text() from public, anon, authenticated;

drop trigger if exists enforce_trade_chat_text_rules on public.trade_chat_messages;
create trigger enforce_trade_chat_text_rules
  before insert or update of body on public.trade_chat_messages
  for each row execute function trade_chat_private.enforce_community_trade_text();

drop trigger if exists enforce_trade_listing_text_rules on public.trade_listings;
create trigger enforce_trade_listing_text_rules
  before insert or update of message on public.trade_listings
  for each row execute function trade_chat_private.enforce_community_trade_text();

notify pgrst, 'reload schema';
