/* Camada de apresentação. Não acessa APIs, credenciais ou estruturas da conta. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const main = $('main-content'), sidebar = $('sidebar');
  const query = $('history-query'), navLinks = [...document.querySelectorAll('[data-nav]')];
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 720px)');
  let connected = false, scheduled = false, searchTimer;
  const exact = new Map(Object.entries({
    'hours of playback logged':'Horas de reprodução registradas',
    'hours of watching, part of it estimated':'Horas registradas e estimadas',
    'titles you actually played':'Registros reproduzidos',
    'not listed anywhere, still stored':'Fora das listas, ainda salvos',
    'not in your library, still stored':'Fora da biblioteca, ainda salvos',
    'opened, never played':'Abertos, sem reprodução',
    'you added, then removed':'Adicionados e depois removidos',
    'average IMDb score of what you watch':'Nota média no IMDb',
    'minutes, the average length you pick':'Duração média dos títulos (min)',
    'Email':'E-mail','Account id':'Identificador da conta','Registered':'Cadastro',
    'Last changed':'Última alteração','Last sign-in':'Último acesso','Supporter tier':'Plano de apoio',
    'Consent recorded':'Consentimento registrado','Scrub':'Excluir','Delete?':'Confirmar?',
    'All time':'Todo o período','All year':'Todos os meses','Collapse the timeline':'Recolher histórico',
    'finished':'Concluído','marked watched':'Marcado como assistido','never played':'Sem reprodução','watched':'Assistido',
    'No genre data available for these titles.':'Não há gêneros disponíveis para os títulos deste período.',
    'No release years available.':'Não há anos de lançamento disponíveis.',
    'No cast data available for these titles.':'Não há dados de elenco disponíveis para estes títulos.',
    'No timestamps recorded.':'Não há datas registradas neste período.',
    'Offered back in Continue Watching':'Em Continuar assistindo',
    'It has a saved position, so the app suggests you resume it.':'Existe uma posição salva para retomar a reprodução.',
    'In your Library':'Na sua biblioteca','Titles you added, to come back to later.':'Títulos adicionados para acessar depois.',
    'Not shown anywhere':'Fora das listas',
    'Watched once and not added, or finished, or dismissed from Continue Watching. Nothing lists it any more. Still stored.':'Itens reproduzidos sem adicionar, concluídos ou removidos de Continuar assistindo. Não aparecem nas listas, mas continuam armazenados.',
    'Friend of the elves':'Fantasia em destaque','Young at heart':'Animação em destaque','Loremaster':'Olhar documental',
    'Walks in shadow':'Terror em destaque','Merry':'Comédia em destaque','Takes it seriously':'Drama em destaque',
    'There and back again':'Aventura em destaque','Swings first':'Ação em destaque','Beyond the stars':'Além das estrelas',
    'Follows the trail':'Crime em destaque','Keeps it wholesome':'Conteúdo para a família','Likes the tension':'Suspense em destaque',
    'Solves it early':'Mistério em destaque','Soft-hearted':'Romance em destaque','Watches by moonlight':'Depois da meia-noite',
    'Up with the lark':'Sessões matinais','Weekender':'Fins de semana','Wide-ranging':'Gostos variados','Single-minded':'Preferências concentradas',
    'Of the elder days':'Clássicos em destaque','Of the fourth age':'Lançamentos recentes','Reads the old scrolls':'Explorando os clássicos',
    'Many long years':'Uma longa história','Keeps the hearth lit':'Histórico extenso','Finishes the quest':'Até o final',
    'You see things through':'Costuma concluir o que começa','Leaves the fellowship':'Pausas pelo caminho',
    'Second breakfast':'Vale o replay','Browses the market':'Explorando títulos','Tidy, in theory':'Fora da biblioteca',
    'Travels light':'Sem adicionar à biblioteca','The long march':'Um dia de muitos títulos','One more episode':'Mais um episódio',
    'Sits for the whole tale':'Preferência por filmes','Kept the watch':'Dias consecutivos','Sailed west, then came back':'Uma pausa e um retorno',
    'A long night in Moria':'Muitas horas em um dia','Walked every league':'Uma série em destaque','Knows it by heart':'Assistido mais de uma vez',
    'Keeper of the annals':'Memória do histórico','Early days':'Primeiros registros',
    'Not enough history to read a pattern':'Ainda não há histórico suficiente para identificar padrões',
    'Only one genre shows up':'Somente um gênero identificado',
    'Your debrid and metadata provider keys, which the apps pull down to configure themselves':'Chaves de provedores de debrid e metadados usadas pelos aplicativos.',
    'Tracker tokens, such as a linked Trakt account':'Tokens de acompanhamento, como uma conta Trakt vinculada.',
    'Profile PIN hashes and their lockout state':'Hashes de PIN dos perfis e estado de bloqueio.',
    'Your signed-in devices and active sessions':'Dispositivos conectados e sessões ativas.'
  }));
  const fragments = [
    ['Entries in your ','Registros no histórico '],[' log',''],[', going back to ',' · desde '],
    ['Since ','Desde '],['Showing ','Conectado a '],['You are still signed in to ','Sua sessão continua conectada a '],
    [' on this device.',' neste dispositivo.'],[' in this tab.',' nesta aba.'],['the backend you name','o backend informado'],
    ['Counted once per title. ','Contado uma vez por título. '],
    [' does not store any of this. It is worked out from the titles in your record.',' não armazena esta distribuição pronta. Ela é calculada a partir dos títulos do histórico.'],
    ['No cast data available for these titles.','Não há dados de elenco disponíveis para estes títulos.'],
    ['Directors you return to: ','Diretores recorrentes: '],
    ['Every name links to a search in ','Cada nome leva a uma busca no '],
    ['. Nobody stores this list. It comes out of the titles in your record.','. A lista é calculada a partir dos títulos no seu histórico.'],
    ['Oldest ','Mais antigo: '],[', newest ',', mais recente: '],[', average year ',', ano médio: '],
    ['. Release year is stored with the record, so nothing had to be looked up.','. O ano de lançamento é obtido dos dados disponíveis do título.'],
    ['Busiest hour: ','Horário com mais registros: '],[', across ',', em '],[' timestamped ',' '],
    [', shown in ',', no fuso '],['entries','registros'],['entry','registro'],
    [', back to ',', desde '],
    [' Hover any registro to scrub it on its own, which Stremio has no way to do.','. Use Excluir para remover um registro individual. O Stremio não oferece exclusão individual'],
    ['. Each one links to its page.','. Cada item com identificador compatível leva à sua página.'],
    [' further ',' adicionais '],[' carries no timestamp and is not shown.',' sem data não são exibidos.'],
    [' carry no timestamp and is not shown.',' sem data não são exibidos.'],
    [' has playback recorded for a title that is not in your library.',' possui reprodução registrada para um título fora da biblioteca.'],
    [' have playback recorded for a title that is not in your library.',' possuem reprodução registrada para títulos fora da biblioteca.'],
    [' · marked watched',' · marcado como assistido'],
    [' leads, ',' lidera, '],[' titles',' títulos'],[' genres in your record',' gêneros no histórico'],
    ['Only ','Somente '],[' genres show up',' gêneros identificados'],['% after midnight','% depois da meia-noite'],
    ['% before 9am','% antes das 9h'],['% at weekends','% nos fins de semana'],['Average release year ','Ano médio de lançamento: '],
    ['Oldest title from ','Título mais antigo de '],[' hours logged',' horas registradas'],[' left unfinished',' não concluídos'],
    [' watched more than once',' assistidos mais de uma vez'],[' opened, never played',' abertos, sem reprodução'],
    [' removed, still held',' removidos, ainda armazenados'],[' watched without adding',' assistidos sem adicionar'],
    [' in a single day',' em um único dia'],['% series','% de séries'],['% films','% de filmes'],
    [' days in a row',' dias consecutivos'],[' days away at the longest',' dias na maior pausa'],[' hours in one day',' horas em um dia'],
    [' episodes of ',' episódios de '],[' times',' vezes'],['Your record starts ','Histórico desde '],
    ['Everything before ','Tudo antes de '],['Just ','Somente '],['Yes, restore ','Confirmar restauração de '],
    ['Restoring…','Restaurando…'],['Working…','Processando…'],['Reading your record again…','Consultando o histórico novamente…'],
    ['Restored. ','Restaurado. '],['Restored ','Restaurados: '],['Deleted ','Excluídos: '],['Cleared ','Limpos: '],['Stopped after ','Interrompido após ']
  ];
  const textSelectors = '#cards .k,#heroperiod,#herocap,#signedintext,#resumetext,#targethost,#years button,#months button,#clocknote,#genrenote,#decnote,#peoplenote,#timelinenote,#shelfnote,#shelfstates .l,#account dt,#withheld li,#badges b,#badges div>span,#timeline .st,#timeline .scrub,#clear-go,#clear-msg,#clear-scope option,#restore-go,#restore-msg,#tl-expand';
  function translateText(text) {
    const trimmed = text.trim();
    if (exact.has(trimmed)) return text.replace(trimmed, exact.get(trimmed));
    let next = text;
    for (const [from,to] of fragments) next = next.split(from).join(to);
    return next;
  }
  // Padrões com nomes próprios preservam o grupo capturado literalmente.
  function badgeDescription(text) {
    let m;
    if((m=/^(.+) leads, ([\d.,]+) titles$/.exec(text)))return m[1]+' lidera, '+m[2]+' títulos';
    if((m=/^([\d.,]+) episodes of (.+)$/.exec(text)))return m[1]+' episódios de '+m[2];
    if((m=/^(.+), ([\d.,]+) times$/.exec(text)))return m[1]+', '+m[2]+' vezes';
    if(/^(?:[\d.,]+(?:%|\s)|Average release year |Oldest title from |Your record starts |Only [\d.,]+ genres |Not enough history|Only one genre)/.test(text))return translateText(text);
    return text;
  }
  function methodNotes() {
    const note=$('hoursnote');
    let text=note.textContent;
    text=text.replace(/([\d.,]+) (?:entry was|entries were) marked watched without any playback time recorded, which is what happens when you mark something watched rather than play it\. (?:It is|They are) counted at the runtime the metadata lists, so about (?:an hour of this total is|([\d.,]+) of these hours are) an estimate rather than a measurement\./g,(_,count,hours)=>count+' registro(s) marcado(s) como assistido(s) não têm tempo de reprodução medido. Isso ocorre ao marcar como assistido em vez de reproduzir. Foi usada a duração informada nos metadados: aproximadamente '+(hours||'1')+' hora(s) deste total são estimadas, não medidas.');
    text=text.replace(/([\d.,]+) (?:title reports|titles report) more time than (?:its|their) runtime allows\. (.+?) adds playback time up across sessions, and across episodes for a series, so a title can total more than it can possibly run\. (?:It is|They are) counted here at what the runtime permits, about ([\d.,]+) hours below the figure the backend reports\./g,(_,count,backend,hours)=>count+' título(s) informam tempo acima da duração disponível. '+backend+' acumula tempo entre sessões e episódios de séries. O RePlay limita esses valores à duração considerada possível, cerca de '+hours+' horas abaixo do valor informado pelo backend.');
    if(text!==note.textContent)note.textContent=text;
  }
  function localize() {
    for (const root of document.querySelectorAll(textSelectors)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
      for(const node of nodes){if(node.parentElement.closest("a"))continue;const value=root.matches("#badges div>span")?badgeDescription(node.nodeValue):translateText(node.nodeValue);if(value!==node.nodeValue)node.nodeValue=value;}
    }
    const title = $('herotitle');
    if(/RePlay$/.test(title.textContent) && /(?:’s |’ |Your )/.test(title.textContent)) {
      title.textContent = title.textContent.replace(/^(.+?)(?:’s |’ )(Nuvio |Stremio )?RePlay$/,(_,name,source)=>'RePlay de '+name+(source?' · '+source.trim():'' )).replace(/^Your (.*)RePlay$/,'Seu RePlay · $1').trim();
    }
  }
  const symbols={clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',play:'<path d="m9 5 10 7-10 7z"/>',star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',box:'<path d="M4 7h16v13H4zM2 3h20v4H2zM9 11h6"/>'};
  function metricIcons(){
    for(const card of $('cards').children){const em=card.querySelector('.em');if(!em||em.dataset.lineIcon)continue;
      const label=card.querySelector('.k')?.textContent||'';
      const shape=/IMDb/.test(label)?'star':/Duração|Horas|minutes|hours/.test(label)?'clock':/reproduzidos|played/.test(label)?'play':/Abertos|opened/.test(label)?'eye':'box';
      em.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+symbols[shape]+'</svg>';em.dataset.lineIcon='true';em.setAttribute('aria-hidden','true');
    }
  }
  function chartTable(){
    const tbody=$('clock-data').tBodies[0], marks=[...$('clock').children];
    const values=marks.map(mark=>{const m=/^(\d{2}):00,\s*(\d+)/.exec(mark.title);return m?{hour:m[1],count:Number(m[2]),mark}:null;}).filter(Boolean);
    const signature=values.map(x=>x.count).join(',');
    // O motor recria as barras mesmo quando as contagens não mudam.
    // Reaplicar atributos acessíveis e a tabela aos novos nós em toda renderização.
    tbody.replaceChildren();tbody.dataset.signature=signature;
    for(const {hour,count,mark} of values){mark.dataset.count=String(count);mark.tabIndex=0;mark.setAttribute('role','img');mark.setAttribute('aria-label',hour+'h: '+count+(count===1?' registro':' registros'));if(count===0)mark.style.height='0%';
      const tr=document.createElement('tr'),h=document.createElement('th'),c=document.createElement('td');h.scope='row';h.textContent=hour+':00';c.textContent=count.toLocaleString('pt-BR');tr.append(h,c);tbody.append(tr);
    }
  }
  function normalize(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');}
  function filterHistory(){
    const needle=normalize(query.value.trim()),items=[...$('timeline').querySelectorAll('ol.tl>li')];let shown=0;
    for(const item of items){const matches=!needle||normalize(item.querySelector('.nm')?.textContent||'').includes(needle);item.hidden=!matches;if(matches)shown++;}
    let year,month;
    for(const node of $('timeline').children){if(node.classList.contains('tlyear')){year=node;node.hidden=true;}else if(node.classList.contains('tlmonth')){month=node;node.hidden=true;}else if(node.matches('ol.tl')){const any=[...node.children].some(x=>!x.hidden);node.hidden=!any;if(any){if(year)year.hidden=false;if(month)month.hidden=false;}}}
    $('timeline').classList.toggle('searching',!!needle);$('history-empty').hidden=shown>0;$('clear-search').hidden=!needle;$('search-explainer').hidden=!needle;
    $('search-summary').textContent=needle?shown.toLocaleString('pt-BR')+' de '+items.length.toLocaleString('pt-BR')+' registros':items.length.toLocaleString('pt-BR')+' registros nesta lista';
  }
  function observe(){observer.observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','disabled']});}
  function sync(){
    scheduled=false;observer.disconnect();
    try{
      const ready=!$('results').hidden && $('signin').hidden;
      if(ready&&!connected)$('read-time').textContent='Sessão iniciada às '+new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date());
      connected=ready;document.body.dataset.authenticated=String(ready);$('login-layout').hidden=$('signin').hidden;query.disabled=!ready;$('export-shortcut').disabled=!ready||$('dl-export').disabled;
      $('session-indicator').textContent=ready?'Conta conectada':'Processamento local';
      for(const a of navLinks){if(ready)a.removeAttribute('aria-disabled');else a.setAttribute('aria-disabled','true');}
      if(!ready){$('breadcrumb-current').textContent='Conectar conta';navLinks.forEach(a=>a.removeAttribute('aria-current'));}
      localize();methodNotes();metricIcons();chartTable();filterHistory();
      $('period-context').textContent=$('years').children.length?'Filtros aplicados aos indicadores':'Todo o histórico disponível';
      $('top-empty').hidden=!!$('top').children.length;
    }finally{observe();}
  }
  const observer=new MutationObserver(records=>{
    if(records.every(r=>r.target.id==='herofig'||r.target.classList?.contains('n')))return;
    if(!scheduled){scheduled=true;queueMicrotask(sync);}
  });
  function active(id){const found=navLinks.find(a=>a.dataset.nav===id);if(!connected||!found)return;navLinks.forEach(a=>{if(a===found)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});$('breadcrumb-current').textContent=found.textContent.trim();}
  function toggleNav(open,restore=true){document.body.classList.toggle('nav-open',open);$('nav-toggle').setAttribute('aria-expanded',String(open));$('nav-backdrop').hidden=!open;if(open)sidebar.querySelector('a').focus();else if(restore)$('nav-toggle').focus();}
  $('nav-toggle').addEventListener('click',()=>toggleNav(!document.body.classList.contains('nav-open')));
  $('nav-backdrop').addEventListener('click',()=>toggleNav(false));
  mobile.addEventListener('change',()=>{if(!mobile.matches)toggleNav(false,false);});
  for(const a of navLinks)a.addEventListener('click',event=>{
    if(!connected){event.preventDefault();$('signin').scrollIntoView({behavior:'auto',block:'start'});$('email').focus();return;}
    active(a.dataset.nav);if(mobile.matches)toggleNav(false,false);
  });
  sidebar.querySelector('a[href="#privacy"]').addEventListener('click',()=>{if(mobile.matches)toggleNav(false,false);$('privacy').open=true;});
  const sectionObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)active(entry.target.id);},{rootMargin:'-100px 0px -60% 0px',threshold:0});
  navLinks.forEach(a=>{const el=$(a.dataset.nav);if(el)sectionObserver.observe(el);});
  function search(){observer.disconnect();try{filterHistory();}finally{observe();}}
  query.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{search();if(query.value.trim()){$('history').scrollIntoView({behavior:motion.matches?'auto':'smooth',block:'start'});active('history');}},100);});
  $('clear-search').addEventListener('click',()=>{query.value='';search();query.focus();});
  $('export-shortcut').addEventListener('click',()=>{if(!$('dl-export').disabled)$('dl-export').click();});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.body.classList.contains('nav-open')){toggleNav(false);event.preventDefault();return;}
    if(event.key==='Tab'&&document.body.classList.contains('nav-open')){const list=[...sidebar.querySelectorAll('a[href],button:not(:disabled)')];const first=list[0],last=list[list.length-1];if(event.shiftKey&&document.activeElement===first){last.focus();event.preventDefault();}else if(!event.shiftKey&&document.activeElement===last){first.focus();event.preventDefault();}}
    if(event.key==='Escape'&&document.activeElement===query){query.value='';search();return;}
    if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!query.disabled&&!event.target.closest('input,textarea,select,[contenteditable=true]')){event.preventDefault();query.focus();}
  });
  sync();
})();
