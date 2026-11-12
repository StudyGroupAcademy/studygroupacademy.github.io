(() => {
  const selector = 'input:not([type=hidden]):not([type=submit]):not([type=reset]):not([type=button]):not([type=image]), select, textarea';
  const enhanced = new WeakSet();
  const nativeDescriptors = new Map();
  const emit = (element, type) => element.dispatchEvent(new Event(type, { bubbles: true }));
  const setValueBridge = (element, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
    if (!descriptor?.get || !descriptor?.set) return;
    const key = element;
    if (!nativeDescriptors.has(key)) {
      nativeDescriptors.set(key, descriptor);
      Object.defineProperty(element, 'value', {
        configurable: true,
        get() { return descriptor.get.call(this); },
        set(next) {
          descriptor.set.call(this, next);
          const view = this.parentElement?.querySelector('.sg-control-view');
          if (view && document.activeElement !== view) syncView(this, view);
          const label = this.parentElement?.querySelector('.sg-select-label');
          if (label) label.textContent = this.selectedOptions?.[0]?.textContent || 'Choose an option';
        }
      });
    }
  };
  const syncView = (native, view) => {
    if (native.type === 'checkbox' || native.type === 'radio') {
      view.setAttribute('aria-checked', String(native.checked));
      view.classList.toggle('is-checked', native.checked);
      return;
    }
    if (native.tagName === 'SELECT') {
      const label = view.querySelector('.sg-select-label');
      if (label) label.textContent = native.selectedOptions?.[0]?.textContent || 'Choose an option';
      return;
    }
    if (view.isContentEditable) view.textContent = native.value || '';
    else view.textContent = native.value || '';
  };
  const makeShell = native => {
    const shell = document.createElement('span');
    shell.className = 'sg-control-shell';
    native.parentNode.insertBefore(shell, native);
    shell.append(native);
    native.classList.add('sg-native-bridge');
    return shell;
  };
  const enhanceText = (native, shell) => {
    const view = document.createElement('div');
    view.className = 'sg-control-view sg-text-view';
    view.contentEditable = 'true';
    view.setAttribute('role', native.tagName === 'TEXTAREA' ? 'textbox' : 'textbox');
    view.setAttribute('aria-multiline', String(native.tagName === 'TEXTAREA'));
    const fallbackPlaceholder = native.type === 'date' ? 'YYYY-MM-DD' : native.type === 'time' ? 'HH:MM' : native.type === 'datetime-local' ? 'YYYY-MM-DD HH:MM' : '';
    view.setAttribute('data-placeholder', native.getAttribute('placeholder') || fallbackPlaceholder);
    view.setAttribute('spellcheck', native.getAttribute('spellcheck') || 'false');
    view.setAttribute('aria-label', native.getAttribute('aria-label') || native.labels?.[0]?.textContent?.trim() || native.name || 'Text field');
    view.textContent = native.value || '';
    if (native.type === 'password') view.classList.add('is-password');
    if (native.disabled || native.readOnly) view.contentEditable = 'false';
    if (native.maxLength >= 0) view.dataset.maxlength = native.maxLength;
    const inputMode = ({number:'decimal', email:'email', url:'url', search:'search', tel:'tel', date:'text', time:'text', 'datetime-local':'text'})[native.type] || native.getAttribute('inputmode') || 'text';
    view.setAttribute('inputmode', inputMode);
    if (native.type === 'date' || native.type === 'time' || native.type === 'datetime-local') view.classList.add('sg-date-time-view');
    shell.append(view);
    const update = () => {
      let value = view.textContent.replace(/\u00a0/g, '');
      if (native.maxLength >= 0 && value.length > native.maxLength) {
        value = value.slice(0, native.maxLength);
        view.textContent = value;
        placeCaretAtEnd(view);
      }
      const descriptor = nativeDescriptors.get(native);
      if (descriptor) descriptor.set.call(native, value);
      else native.value = value;
      emit(native, 'input');
      emit(native, 'change');
      view.classList.toggle('is-empty', !value);
    };
    view.addEventListener('input', update);
    view.addEventListener('keydown', event => {
      if (event.key === 'Enter' && native.tagName !== 'TEXTAREA') event.preventDefault();
      if (event.key === 'Enter' && native.tagName === 'TEXTAREA' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        native.form?.requestSubmit();
      }
    });
    view.addEventListener('blur', () => {
      if (native.type === 'email' && view.textContent && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(view.textContent)) view.classList.add('is-invalid');
      else view.classList.remove('is-invalid');
    });
    native.addEventListener('input', () => syncView(native, view));
    native.addEventListener('change', () => syncView(native, view));
    setValueBridge(native);
    if (native.type === 'date' || native.type === 'time' || native.type === 'datetime-local') addDateTimePicker(native, shell, view);
  };
  const placeCaretAtEnd = element => {
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const enhanceSelect = (native, shell) => {
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'sg-control-view sg-select-view';
    view.setAttribute('aria-haspopup', 'listbox');
    view.setAttribute('aria-expanded', 'false');
    view.innerHTML = '<span class="sg-select-label"></span><span class="sg-select-chevron" aria-hidden="true">⌄</span>';
    const label = view.querySelector('.sg-select-label');
    label.textContent = native.selectedOptions?.[0]?.textContent || 'Choose an option';
    const menu = document.createElement('div');
    menu.className = 'sg-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    const refresh = () => {
      menu.replaceChildren();
      [...native.options].forEach((option, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'sg-select-option';
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(option.selected));
        item.disabled = option.disabled;
        item.textContent = option.textContent;
        item.addEventListener('click', () => {
          native.selectedIndex = index;
          emit(native, 'input');
          emit(native, 'change');
          label.textContent = option.textContent;
          close();
          view.focus();
        });
        menu.append(item);
      });
    };
    const close = () => { menu.hidden = true; view.setAttribute('aria-expanded', 'false'); view.classList.remove('is-open'); };
    const open = () => { refresh(); menu.hidden = false; view.setAttribute('aria-expanded', 'true'); view.classList.add('is-open'); };
    view.addEventListener('click', () => menu.hidden ? open() : close());
    view.addEventListener('keydown', event => {
      if (['Enter',' ','ArrowDown'].includes(event.key)) { event.preventDefault(); open(); menu.querySelector('.sg-select-option:not(:disabled)')?.focus(); }
      if (event.key === 'Escape') close();
    });
    menu.addEventListener('keydown', event => {
      const items = [...menu.querySelectorAll('.sg-select-option:not(:disabled)')];
      const index = items.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') { event.preventDefault(); items[Math.min(index + 1, items.length - 1)]?.focus(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); items[Math.max(index - 1, 0)]?.focus(); }
      if (event.key === 'Escape') { close(); view.focus(); }
    });
    document.addEventListener('click', event => { if (!shell.contains(event.target)) close(); });
    native.addEventListener('change', () => { label.textContent = native.selectedOptions?.[0]?.textContent || 'Choose an option'; refresh(); });
    shell.append(view, menu);
    setValueBridge(native);
    new MutationObserver(refresh).observe(native, { childList: true, subtree: true, attributes: true });
  };
  const addDateTimePicker = (native, shell, view) => {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sg-picker-trigger';
    trigger.setAttribute('aria-label', native.type.includes('time') ? 'Choose time' : 'Choose date');
    trigger.textContent = native.type === 'time' ? '◷' : '▦';
    const panel = document.createElement('div');
    panel.className = 'sg-picker-panel';
    panel.hidden = true;
    const close = () => panel.hidden = true;
    trigger.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) renderPicker();
    });
    function renderPicker() {
      panel.replaceChildren();
      if (native.type === 'time') {
        const heading = document.createElement('strong'); heading.textContent = 'Choose a time'; panel.append(heading);
        const grid = document.createElement('div'); grid.className = 'sg-time-grid';
        for (let hour = 6; hour <= 22; hour++) for (const minute of ['00','30']) {
          const value = `${String(hour).padStart(2,'0')}:${minute}`;
          const button = document.createElement('button'); button.type = 'button'; button.textContent = value; button.className = 'sg-picker-choice';
          button.addEventListener('click', () => { native.value = value; syncView(native, view); emit(native,'input'); emit(native,'change'); close(); }); grid.append(button);
        }
        panel.append(grid); return;
      }
      const now = native.value ? new Date(`${native.value.slice(0,10)}T12:00:00`) : new Date();
      let year = now.getFullYear(), month = now.getMonth();
      const heading = document.createElement('div'); heading.className = 'sg-calendar-heading';
      const title = document.createElement('strong');
      const prev = document.createElement('button'); prev.type='button'; prev.textContent='‹';
      const next = document.createElement('button'); next.type='button'; next.textContent='›';
      const draw = () => {
        title.textContent = new Date(year,month,1).toLocaleDateString(undefined,{month:'long',year:'numeric'});
        grid.replaceChildren();
        ['S','M','T','W','T','F','S'].forEach(day => { const el=document.createElement('span');el.className='sg-calendar-weekday';el.textContent=day;grid.append(el); });
        const first = new Date(year,month,1).getDay(), count = new Date(year,month+1,0).getDate();
        for(let i=0;i<first;i++) grid.append(document.createElement('span'));
        for(let day=1;day<=count;day++) { const b=document.createElement('button');b.type='button';b.className='sg-picker-choice';b.textContent=day;b.addEventListener('click',()=>{const date=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;native.value=native.type==='datetime-local'?`${date}T09:00`:date;syncView(native,view);emit(native,'input');emit(native,'change');close();});grid.append(b); }
      };
      prev.addEventListener('click',()=>{month--;if(month<0){month=11;year--;}draw();}); next.addEventListener('click',()=>{month++;if(month>11){month=0;year++;}draw();});
      heading.append(prev,title,next); panel.append(heading);
      const grid=document.createElement('div');grid.className='sg-calendar-grid';panel.append(grid);draw();
    }
    shell.append(trigger,panel);
    document.addEventListener('click',event=>{if(!shell.contains(event.target))close();});
  };
  const enhanceRange = (native, shell) => {
    const view=document.createElement('div');view.className='sg-control-view sg-range-view';view.tabIndex=native.disabled?-1:0;view.setAttribute('role','slider');
    const track=document.createElement('div');track.className='sg-range-track';const fill=document.createElement('span');fill.className='sg-range-fill';const thumb=document.createElement('span');thumb.className='sg-range-thumb';track.append(fill,thumb);view.append(track);
    const min=()=>Number(native.min||0),max=()=>Number(native.max||100),step=()=>Number(native.step||1);
    const sync=()=>{const percent=Math.max(0,Math.min(100,(Number(native.value)-min())/(max()-min()||1)*100));fill.style.width=percent+'%';thumb.style.left=percent+'%';view.setAttribute('aria-valuemin',min());view.setAttribute('aria-valuemax',max());view.setAttribute('aria-valuenow',native.value);};
    const update=event=>{const rect=track.getBoundingClientRect();const raw=min()+Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*(max()-min());native.value=String(Math.round(raw/step())*step());sync();emit(native,'input');emit(native,'change');};
    track.addEventListener('pointerdown',event=>{if(native.disabled)return;track.setPointerCapture(event.pointerId);update(event);});track.addEventListener('pointermove',event=>{if(event.buttons===1)update(event);});
    view.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();let value=Number(native.value);if(event.key==='Home')value=min();else if(event.key==='End')value=max();else value+=(['ArrowRight','ArrowUp'].includes(event.key)?1:-1)*step();native.value=String(Math.max(min(),Math.min(max(),value)));sync();emit(native,'input');emit(native,'change');});
    native.addEventListener('input',sync);native.addEventListener('change',sync);shell.append(view);sync();setValueBridge(native);
  };
  const enhanceChoice = (native, shell) => {
    const view = document.createElement('button'); view.type='button'; view.className=`sg-control-view sg-choice-view ${native.type === 'radio' ? 'is-radio' : 'is-checkbox'}`;
    view.setAttribute('role',native.type); view.setAttribute('aria-checked',String(native.checked));
    view.addEventListener('click',event=>{event.preventDefault();if(native.disabled)return; if(native.type==='checkbox')native.checked=!native.checked; else { const group=native.form?.elements?.namedItem(native.name); if(group && typeof group.length==='number') [...group].forEach(item=>{if(item!==native){item.checked=false;item.parentElement?.querySelector('.sg-choice-view')?.classList.remove('is-checked');}}); native.checked=true; } syncView(native,view); emit(native,'input'); emit(native,'change'); });
    shell.append(view); syncView(native,view); native.addEventListener('change',()=>syncView(native,view));
  };
  const enhance = native => {
    if (enhanced.has(native) || native.closest('.sg-control-shell')) return;
    if (native.type === 'file') {
      enhanced.add(native);
      const shell=makeShell(native); const button=document.createElement('button');button.type='button';button.className='sg-control-view sg-file-view';button.textContent='Choose file';
      const name=document.createElement('span');name.className='sg-file-name';name.textContent=native.files?.[0]?.name||'No file selected';button.addEventListener('click',()=>native.click());native.addEventListener('change',()=>name.textContent=native.files?.[0]?.name||'No file selected');shell.append(button,name);return;
    }
    enhanced.add(native);
    const shell=makeShell(native);
    if(native.tagName==='SELECT') enhanceSelect(native,shell);
    else if(native.type==='checkbox'||native.type==='radio') enhanceChoice(native,shell);
    else if(native.type==='range') enhanceRange(native,shell);
    else enhanceText(native,shell);
    native.addEventListener('invalid',event=>{event.preventDefault();const view=shell.querySelector('.sg-control-view');view?.classList.add('is-invalid');view?.focus();});
  };
  const scan = root => { if(root.matches?.(selector)) enhance(root); root.querySelectorAll?.(selector).forEach(enhance); };
  const start = () => {
    scan(document);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if(node.nodeType===1) scan(node); }))).observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
