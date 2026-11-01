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

  if v_body ~* '(^|[^[:alnum:]])(fuck(ing|er|ers)?|shit(ty|head)?|bitch(es)?|asshole|bastard|dickhead|cunt|retard(ed)?|motherfucker|putain|merde|connard(e|s)?|salope|encul[eé]|fils? de pute|idiot(e|s)?|stupid|dumb|moron|loser|abruti(e|s)?|débile(s)?|ta gueule|ferme[- ]la|t[''’]?es con(ne)?)([^[:alnum:]]|$)' then
    raise exception 'Please keep the chat friendly. Insults are not allowed.' using errcode = '22023';
  end if;

  if v_body ~* '([[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,})|(https?://|www[.]|discord[.]gg/|t[.]me/|wa[.]me/)|([[:alnum:]-]+[.](com|net|org|gg|io|me|fr|tv|co|uk|xyz|link)(/[^[:space:]]*)?)|(\+?[0-9][0-9() .-]{5,}[0-9])|(my (full name|real name|address|phone|number|email|school|location|age|discord|snap(chat)?|instagram|tiktok|whatsapp|telegram)( is)?|my name is|i live at|contact me at|reach me at|dm me on|mon nom complet|mon adresse|mon num[eé]ro|mon téléphone|mon collège|mon lycée|j[''’]?habite|mon compte (discord|snap(chat)?|instagram|tiktok|whatsapp)|contacte-moi sur|mon insta c''est|mon snap c''est)|(send( me)?|share( with me)?|give me|what['']?s|what is|tell( me)?)\s+(your|the)?\s*(full name|address|phone|number|email|discord|snap(chat)?|instagram|tiktok|whatsapp|school|location)|(donne-moi|donne moi|envoie-moi|envoie moi|c''est quoi ton|c''est quoi ta)\s+(adresse|num[eé]ro|téléphone|email|discord|snap|instagram|lycée|collège)|(\d{1,6}\s+[[:alpha:]0-9 .''-]{2,30}\s+(street|st|road|rd|avenue|ave|boulevard|blvd|rue|route|chemin))' then
    raise exception 'For your safety, do not share personal details, phone numbers, email addresses, or links.' using errcode = '22023';
  end if;

  if v_body ~* '(^|[^[:alnum:]])(robux|paypal|cash ?app|venmo|real money|real[- ]world money|money for items|sell(ing)? for cash|buy(ing)? for cash|argent réel|vrai argent)([^[:alnum:]]|$)' then
    raise exception 'Robux and real-money trades are not allowed. Trade Turbo Soccer items in game only.' using errcode = '22023';
  end if;
end;
$function$;

revoke all on function trade_chat_private.validate_community_trade_text(text) from public, anon, authenticated;
