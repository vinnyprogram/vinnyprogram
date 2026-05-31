import { useState } from "react";
import { useNavigate } from "react-router-dom";

const content = {
  en: {
    title: "How to Use",
    subtitle: "Step-by-step guide to creating estimates",
    intro_title: "📱 Designed for the field",
    intro_body: "This app is built to be used on your phone while measuring on site. Follow these 7 steps to go from blank page to a complete estimate ready to send to the office.",
    start: "Start Estimate →",
    start_btn: "🏠 Start New Estimate",
    quick_ref: "⚡ Quick Reference",
    steps: [
      { number:"01", icon:"👤", title:"Select or Register Customer", color:"#3b82f6", bg:"#eff6ff", border:"#93c5fd",
        description:"Search by name or phone number. If the customer doesn't exist, tap '+ New' to register them with name, phone, company and email.",
        tips:["Type at least 1 character to search","Phone search works too — try typing the number","After selecting, enter the job address for this specific project"]},
      { number:"02", icon:"📋", title:"Fill Crew Info", color:"#f97316", bg:"#fff7ed", border:"#fed7aa",
        description:"Select the job type, fire blocking, ladder needed, parking availability, number of units and any extra notes for the crew.",
        tips:["Job type: New Construction, Remodeling, Addition, etc.","Fire Blocking Yes/No — important for crew prep","Extra notes: access codes, dogs, special instructions"]},
      { number:"03", icon:"🏠", title:"Select Floor", color:"#059669", bg:"#f0fdf4", border:"#86efac",
        description:"Tap the floor tab where you're measuring — Attic, 3rd Floor, 2nd Floor, etc. Add custom floors with '+ Floor' if needed.",
        tips:["Start from the top floor and work down","Each floor keeps its areas separate","Tap '+ Floor' to add Garage, Crawlspace, or any custom floor"]},
      { number:"04", icon:"📐", title:"Add Areas", color:"#8b5cf6", bg:"#f5f3ff", border:"#c4b5fd",
        description:"Tap '+ Add area' then select the area type, material, thickness, R-value and OC. Then enter your H × L measurements.",
        tips:["Area type: Roof Rafter, Exterior Wall, Rim Joist, etc.","For Combo (2 passes): select ⚡ Combo and pick each material","H × L × Q — height × length × quantity. Q defaults to 1","Tab or tap away after entering L to auto-calculate","Add multiple measurements per area — they stack up","Use '− deduct' to subtract openings like windows/doors"]},
      { number:"05", icon:"✅", title:"Complete & Review", color:"#059669", bg:"#f0fdf4", border:"#86efac",
        description:"When an area is complete it turns green and collapses. Tap ✏️ to edit or '+ Add area' to add the next one. Check the Estimate panel at the bottom.",
        tips:["Green card = area is complete with type + material + sqft","Tap the green bar '✓ Done editing' to collapse back","Bottom bar shows running total — tap ▲ to expand full estimate","Estimate groups same areas across floors automatically"]},
      { number:"06", icon:"💾", title:"Save the Project", color:"#0f172a", bg:"#f8fafc", border:"#cbd5e1",
        description:"Tap Save when done. You must have a customer and at least one area. After saving, two buttons appear — Office Report and Quote PDF.",
        tips:["Save button is greyed out until customer + area are filled","Office Report → send measurements to office for pricing","Quote PDF → customer-facing proposal","Both are accessible anytime from Search Estimates"]},
      { number:"07", icon:"📧", title:"Send to Office", color:"#3b82f6", bg:"#eff6ff", border:"#93c5fd",
        description:"Open the Office Report and tap '📧 Email Office'. It opens your email app pre-filled with all measurements. Add optional items before sending.",
        tips:["Add optional items (alternatives) before emailing","Office fills in pricing and sends final quote to customer","You can print the report directly from the page","Access old reports anytime: Estimates → Search Estimates"]},
    ],
    refs:[
      ["H × L × Q","Height × Length × Quantity (default 1)"],
      ["Green card","Area is complete — tap ✏️ to edit"],
      ["⚡ Combo","Two materials on same area (e.g. 3\"cc + 7\"oc)"],
      ["− deduct","Subtract windows, doors, openings"],
      ["▲ Estimate","Bottom bar — tap to see full estimate"],
      ["📋 Office","Field report with measurements for pricing"],
      ["📄 Quote","Customer-facing proposal PDF"],
    ]
  },
  pt: {
    title: "Como Usar",
    subtitle: "Guia passo a passo para criar orçamentos",
    intro_title: "📱 Desenvolvido para o campo",
    intro_body: "Este app foi criado para ser usado no celular enquanto você mede no local. Siga esses 7 passos para criar um orçamento completo e enviar para o escritório.",
    start: "Iniciar Orçamento →",
    start_btn: "🏠 Iniciar Novo Orçamento",
    quick_ref: "⚡ Referência Rápida",
    steps: [
      { number:"01", icon:"👤", title:"Selecionar ou Cadastrar Cliente", color:"#3b82f6", bg:"#eff6ff", border:"#93c5fd",
        description:"Busque pelo nome ou telefone. Se o cliente não existir, toque em '+ Novo' para cadastrá-lo com nome, telefone, empresa e e-mail.",
        tips:["Digite pelo menos 1 caractere para buscar","Busca por telefone também funciona","Após selecionar, informe o endereço da obra para este projeto"]},
      { number:"02", icon:"📋", title:"Preencher Info da Equipe", color:"#f97316", bg:"#fff7ed", border:"#fed7aa",
        description:"Selecione o tipo de serviço, bloqueio de fogo, escada necessária, disponibilidade de estacionamento, número de unidades e observações para a equipe.",
        tips:["Tipo: Nova Construção, Reforma, Adição, etc.","Bloqueio de Fogo Sim/Não — importante para preparação","Observações: códigos de acesso, cães, instruções especiais"]},
      { number:"03", icon:"🏠", title:"Selecionar Andar", color:"#059669", bg:"#f0fdf4", border:"#86efac",
        description:"Toque na aba do andar onde está medindo — Sótão, 3º Andar, 2º Andar, etc. Adicione andares personalizados com '+ Andar'.",
        tips:["Comece pelo andar de cima e vá descendo","Cada andar mantém suas áreas separadas","Toque em '+ Andar' para adicionar Garagem, Porão, etc."]},
      { number:"04", icon:"📐", title:"Adicionar Áreas", color:"#8b5cf6", bg:"#f5f3ff", border:"#c4b5fd",
        description:"Toque em '+ Adicionar área', selecione o tipo, material, espessura, valor R e OC. Em seguida, informe as medidas A × L.",
        tips:["Tipo: Viga de Telhado, Parede Externa, Viga de Bordão, etc.","Para Combo (2 passagens): selecione ⚡ Combo","A × L × Q — altura × largura × quantidade. Q padrão é 1","Tab ou toque fora após inserir L para calcular automaticamente","Adicione múltiplas medidas por área — elas se acumulam","Use '− dedução' para subtrair janelas, portas, aberturas"]},
      { number:"05", icon:"✅", title:"Finalizar e Revisar", color:"#059669", bg:"#f0fdf4", border:"#86efac",
        description:"Quando uma área está completa, fica verde e se recolhe. Toque em ✏️ para editar ou '+ Adicionar área' para a próxima. Confira o painel de orçamento no rodapé.",
        tips:["Card verde = área completa com tipo + material + m²","Toque na barra verde '✓ Edição concluída' para recolher","Barra inferior mostra o total — toque em ▲ para expandir","O orçamento agrupa áreas iguais de andares diferentes"]},
      { number:"06", icon:"💾", title:"Salvar o Projeto", color:"#0f172a", bg:"#f8fafc", border:"#cbd5e1",
        description:"Toque em Salvar quando terminar. É necessário ter um cliente e pelo menos uma área. Após salvar, aparecem dois botões — Relatório do Escritório e PDF do Orçamento.",
        tips:["Botão Salvar fica cinza até ter cliente + área preenchidos","Relatório do Escritório → enviar medidas para precificação","PDF do Orçamento → proposta para o cliente","Acessíveis a qualquer momento em Buscar Orçamentos"]},
      { number:"07", icon:"📧", title:"Enviar para o Escritório", color:"#3b82f6", bg:"#eff6ff", border:"#93c5fd",
        description:"Abra o Relatório do Escritório e toque em '📧 Email Escritório'. Abre seu app de e-mail já preenchido com todas as medidas.",
        tips:["Adicione itens opcionais (alternativas) antes de enviar","Escritório preenche os preços e envia a proposta final","Você pode imprimir o relatório direto da página","Acesse relatórios antigos: Orçamentos → Buscar Orçamentos"]},
    ],
    refs:[
      ["A × L × Q","Altura × Largura × Quantidade (padrão 1)"],
      ["Card verde","Área completa — toque ✏️ para editar"],
      ["⚡ Combo","Dois materiais na mesma área (ex: 3\"cc + 7\"oc)"],
      ["− dedução","Subtrair janelas, portas, aberturas"],
      ["▲ Orçamento","Barra inferior — toque para ver total"],
      ["📋 Escritório","Relatório de campo com medidas para precificação"],
      ["📄 Orçamento","PDF de proposta para o cliente"],
    ]
  },
  es: {
    title: "Cómo Usar",
    subtitle: "Guía paso a paso para crear presupuestos",
    intro_title: "📱 Diseñado para el campo",
    intro_body: "Esta app está hecha para usarse en el celular mientras mides en el sitio. Sigue estos 7 pasos para crear un presupuesto completo y enviarlo a la oficina.",
    start: "Iniciar Presupuesto →",
    start_btn: "🏠 Iniciar Nuevo Presupuesto",
    quick_ref: "⚡ Referencia Rápida",
    steps: [
      { number:"01", icon:"👤", title:"Seleccionar o Registrar Cliente", color:"#3b82f6", bg:"#eff6ff", border:"#93c5fd",
        description:"Busca por nombre o teléfono. Si el cliente no existe, toca '+ Nuevo' para registrarlo con nombre, teléfono, empresa y correo.",
        tips:["Escribe al menos 1 carácter para buscar","La búsqueda por teléfono también funciona","Tras seleccionar, ingresa la dirección de la obra para este proyecto"]},
      { number:"02", icon:"📋", title:"Llenar Info del Equipo", color:"#f97316", bg:"#fff7ed", border:"#fed7aa",
        description:"Selecciona el tipo de trabajo, bloqueo de fuego, escalera necesaria, disponibilidad de estacionamiento, número de unidades y notas para el equipo.",
        tips:["Tipo: Nueva Construcción, Remodelación, Adición, etc.","Bloqueo de Fuego Sí/No — importante para la preparación","Notas: códigos de acceso, perros, instrucciones especiales"]},
      { number:"03", icon:"🏠", title:"Seleccionar Piso", color:"#059669", bg:"#f0fdf4", border:"#86efac",
        description:"Toca la pestaña del piso donde estás midiendo — Ático, 3er Piso, 2do Piso, etc. Agrega pisos personalizados con '+ Piso'.",
        tips:["Empieza por el piso de arriba y baja","Cada piso mantiene sus áreas por separado","Toca '+ Piso' para agregar Garaje, Sótano, etc."]},
      { number:"04", icon:"📐", title:"Agregar Áreas", color:"#8b5cf6", bg:"#f5f3ff", border:"#c4b5fd",
        description:"Toca '+ Agregar área', selecciona el tipo, material, grosor, valor R y OC. Luego ingresa las medidas A × L.",
        tips:["Tipo: Viga de Techo, Pared Exterior, Viga de Borde, etc.","Para Combo (2 pasadas): selecciona ⚡ Combo","A × L × C — alto × largo × cantidad. C es 1 por defecto","Tab o toca fuera tras ingresar L para calcular automáticamente","Agrega múltiples medidas por área — se acumulan","Usa '− deducción' para restar ventanas, puertas, aperturas"]},
      { number:"05", icon:"✅", title:"Completar y Revisar", color:"#059669", bg:"#f0fdf4", border:"#86efac",
        description:"Cuando un área está completa se vuelve verde y se colapsa. Toca ✏️ para editar o '+ Agregar área' para la siguiente. Revisa el panel de presupuesto en la parte inferior.",
        tips:["Tarjeta verde = área completa con tipo + material + m²","Toca la barra verde '✓ Edición completa' para colapsar","Barra inferior muestra el total — toca ▲ para expandir","El presupuesto agrupa áreas iguales de distintos pisos"]},
      { number:"06", icon:"💾", title:"Guardar el Proyecto", color:"#0f172a", bg:"#f8fafc", border:"#cbd5e1",
        description:"Toca Guardar al terminar. Debes tener un cliente y al menos un área. Tras guardar, aparecen dos botones — Reporte de Oficina y PDF del Presupuesto.",
        tips:["Botón Guardar está gris hasta tener cliente + área","Reporte de Oficina → enviar medidas para cotización","PDF del Presupuesto → propuesta para el cliente","Accesibles siempre desde Buscar Presupuestos"]},
      { number:"07", icon:"📧", title:"Enviar a la Oficina", color:"#3b82f6", bg:"#eff6ff", border:"#93c5fd",
        description:"Abre el Reporte de Oficina y toca '📧 Email Oficina'. Abre tu app de correo ya completada con todas las medidas.",
        tips:["Agrega ítems opcionales (alternativas) antes de enviar","La oficina completa los precios y envía la propuesta final","Puedes imprimir el reporte directamente desde la página","Accede a reportes anteriores: Presupuestos → Buscar"]},
    ],
    refs:[
      ["A × L × C","Alto × Largo × Cantidad (predeterminado 1)"],
      ["Tarjeta verde","Área completa — toca ✏️ para editar"],
      ["⚡ Combo","Dos materiales en la misma área (ej: 3\"cc + 7\"oc)"],
      ["− deducción","Restar ventanas, puertas, aperturas"],
      ["▲ Presupuesto","Barra inferior — toca para ver el total"],
      ["📋 Oficina","Reporte de campo con medidas para cotización"],
      ["📄 Presupuesto","PDF de propuesta para el cliente"],
    ]
  }
};

export default function HowToUse() {
  const navigate = useNavigate();
  const [lang, setLang] = useState("en");
  const t = content[lang];

  return (
    <div style={{ fontFamily:"Inter,system-ui,sans-serif", background:"#f6f7fb",
        minHeight:"100vh", paddingBottom:40 }}>

      {/* header */}
      <div style={{ background:"#0f172a", padding:"16px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
          <button onClick={()=>navigate(-1)}
            style={{ border:"1px solid #475569", background:"none", color:"#94a3b8",
              padding:"6px 12px", borderRadius:8, cursor:"pointer", fontSize:12 }}>
            ← Back
          </button>
          <div style={{ flex:1 }}>
            <div style={{ color:"white", fontWeight:800, fontSize:16 }}>{t.title}</div>
            <div style={{ color:"#94a3b8", fontSize:11, marginTop:1 }}>{t.subtitle}</div>
          </div>
          <button onClick={()=>navigate("/project/new?type=onsite")}
            style={{ border:"none", background:"#059669", color:"white",
              padding:"8px 14px", borderRadius:8, cursor:"pointer",
              fontSize:12, fontWeight:700 }}>
            {t.start}
          </button>
        </div>

        {/* language selector */}
        <div style={{ display:"flex", gap:6 }}>
          {[["en","🇺🇸 English"],["pt","🇧🇷 Português"],["es","🇪🇸 Español"]].map(([code,label])=>(
            <button key={code} onClick={()=>setLang(code)}
              style={{ padding:"5px 12px", borderRadius:20, border:"none",
                cursor:"pointer", fontSize:12, fontWeight:lang===code?700:400,
                background: lang===code?"#f97316":"#1e293b",
                color: lang===code?"white":"#94a3b8" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:600, margin:"0 auto", padding:"20px 16px" }}>

        {/* intro */}
        <div style={{ background:"white", borderRadius:12, padding:"16px 18px",
            border:"1px solid #e2e8f0", marginBottom:20,
            boxShadow:"0 2px 8px rgba(0,0,0,.04)" }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:6 }}>
            {t.intro_title}
          </div>
          <div style={{ fontSize:13, color:"#64748b", lineHeight:1.7 }}>
            {t.intro_body}
          </div>
        </div>

        {/* steps */}
        {t.steps.map((step,i)=>(
          <div key={i} style={{ background:"white", borderRadius:12,
              border:`1.5px solid ${step.border}`, marginBottom:12,
              overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.04)" }}>
            <div style={{ background:step.bg, padding:"12px 16px",
                display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:36, height:36, borderRadius:10,
                  background:step.color, display:"flex",
                  alignItems:"center", justifyContent:"center",
                  fontSize:18, flexShrink:0 }}>
                {step.icon}
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:step.color,
                    textTransform:"uppercase", letterSpacing:0.5 }}>
                  Step {step.number}
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>
                  {step.title}
                </div>
              </div>
            </div>
            <div style={{ padding:"12px 16px" }}>
              <div style={{ fontSize:13, color:"#374151", lineHeight:1.7, marginBottom:10 }}>
                {step.description}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {step.tips.map((tip,j)=>(
                  <div key={j} style={{ display:"flex", gap:8, alignItems:"flex-start",
                      fontSize:12, color:"#64748b", lineHeight:1.5 }}>
                    <span style={{ color:step.color, fontWeight:700,
                        flexShrink:0, marginTop:1 }}>→</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* quick reference */}
        <div style={{ background:"#0f172a", borderRadius:12,
            padding:"16px 18px", marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"white", marginBottom:12 }}>
            {t.quick_ref}
          </div>
          {t.refs.map(([term,def],i)=>(
            <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start",
                padding:"6px 0",
                borderBottom: i<t.refs.length-1?"1px solid #1e293b":"none" }}>
              <span style={{ fontSize:11, fontWeight:700, color:"#f97316",
                  minWidth:90, flexShrink:0 }}>{term}</span>
              <span style={{ fontSize:11, color:"#94a3b8", lineHeight:1.5 }}>{def}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button onClick={()=>navigate("/project/new?type=onsite")}
          style={{ width:"100%", padding:"14px", borderRadius:12, border:"none",
            background:"#059669", color:"white", fontWeight:700,
            fontSize:15, cursor:"pointer" }}>
          {t.start_btn}
        </button>
      </div>
    </div>
  );
}
