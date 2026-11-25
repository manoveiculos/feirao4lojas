import type { Metadata } from 'next';
import Link from 'next/link';
import { FEIRAO_CONFIG, LOJAS, WHATSAPP_NUMBER } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Política de Privacidade | Acelera V3',
  description: 'Como o Acelera V3 (feirão das 4 lojas em Rio do Sul/SC) coleta, usa e protege seus dados pessoais, conforme a LGPD.',
  alternates: { canonical: '/privacidade' },
};

const ATUALIZADA_EM = '25 de novembro de 2026';
const EMAIL = (process.env.NEXT_PUBLIC_CONTATO_EMAIL || '').trim();

function telefoneFormatado(): string {
  const d = WHATSAPP_NUMBER;
  if (!d) return '';
  const local = d.startsWith('55') ? d.slice(2) : d;
  return `(${local.slice(0, 2)}) ${local.slice(2, local.length - 4)}-${local.slice(-4)}`;
}

function Secao({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mt-10 text-xl font-extrabold text-slate-900">{titulo}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export default function PrivacidadePage() {
  const tel = telefoneFormatado();
  const contato = (
    <>
      {tel && (
        <>
          WhatsApp{' '}
          <a className="font-semibold text-orange-700 underline" href={`https://wa.me/${WHATSAPP_NUMBER}`}>
            {tel}
          </a>
        </>
      )}
      {tel && EMAIL && ' ou '}
      {EMAIL && (
        <>
          e-mail{' '}
          <a className="font-semibold text-orange-700 underline" href={`mailto:${EMAIL}`}>
            {EMAIL}
          </a>
        </>
      )}
      {!tel && !EMAIL && 'os canais de atendimento das lojas participantes'}
    </>
  );

  return (
    <main className="min-h-dvh bg-slate-50">
      <header className="bg-[#062835] text-white">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <Link href="/" className="text-lg font-black italic">
            ACELERA <span className="text-orange-400">V3</span>
          </Link>
          <h1 className="mt-3 text-3xl font-black">Política de Privacidade</h1>
          <p className="mt-1 text-sm text-slate-300">Última atualização: {ATUALIZADA_EM}</p>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <p className="mt-8 text-[15px] leading-relaxed text-slate-700">
          Esta política explica como o <b>{FEIRAO_CONFIG.nome}</b>, feirão de veículos realizado em {FEIRAO_CONFIG.cidade}, trata
          os dados pessoais de quem visita este site e conversa conosco pelo WhatsApp, em conformidade com a Lei Geral de Proteção
          de Dados (Lei nº 13.709/2018 — LGPD).
        </p>

        <nav aria-label="Sumário" className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-orange-700">
            <li><a href="#quem-somos" className="hover:underline">Quem somos</a></li>
            <li><a href="#dados" className="hover:underline">Quais dados coletamos</a></li>
            <li><a href="#finalidades" className="hover:underline">Para que usamos</a></li>
            <li><a href="#whatsapp" className="hover:underline">Atendimento pelo WhatsApp e assistente virtual</a></li>
            <li><a href="#compartilhamento" className="hover:underline">Com quem compartilhamos</a></li>
            <li><a href="#cookies" className="hover:underline">Cookies e anúncios</a></li>
            <li><a href="#retencao" className="hover:underline">Por quanto tempo guardamos</a></li>
            <li><a href="#direitos" className="hover:underline">Seus direitos</a></li>
            <li><a href="#exclusao" className="hover:underline">Como excluir seus dados</a></li>
            <li><a href="#seguranca" className="hover:underline">Segurança</a></li>
            <li><a href="#contato" className="hover:underline">Contato</a></li>
          </ol>
        </nav>

        <Secao id="quem-somos" titulo="1. Quem somos">
          <p>
            O {FEIRAO_CONFIG.nome} é uma ação conjunta das lojas {LOJAS.map((l) => l.nome).join(', ').replace(/, ([^,]*)$/, ' e $1')}, todas
            de {FEIRAO_CONFIG.cidade}. Essas lojas são as responsáveis (controladoras) pelos dados tratados no feirão. O evento presencial
            acontece em {FEIRAO_CONFIG.localPrincipal.endereco}.
          </p>
        </Secao>

        <Secao id="dados" titulo="2. Quais dados coletamos">
          <ul className="list-disc space-y-2 pl-5">
            <li><b>Dados que você nos informa:</b> nome, número de WhatsApp e o carro ou tipo de carro que procura, quando você preenche um formulário no site.</li>
            <li>
              <b>Dados da conversa no WhatsApp:</b> as mensagens que você nos envia e as informações que compartilha para o atendimento, como
              faixa de valor, entrada, forma de pagamento, carro para troca (modelo, ano e quilometragem), prazo de compra e cidade.
            </li>
            <li>
              <b>Dados de navegação e de origem:</b> páginas e carros visualizados, cliques nos botões de WhatsApp, parâmetros da campanha que
              trouxe você ao site (como <i>utm_source</i> e <i>utm_campaign</i>), identificadores de clique de anúncios (<i>fbclid</i>) e um código
              anônimo do seu navegador que nos permite ligar o clique no site à conversa no WhatsApp.
            </li>
          </ul>
          <p>Não pedimos CPF, documentos, senhas ou dados de cartão pelo site ou pelo WhatsApp. A documentação é tratada presencialmente na loja.</p>
        </Secao>

        <Secao id="finalidades" titulo="3. Para que usamos seus dados">
          <ul className="list-disc space-y-2 pl-5">
            <li>Responder ao seu contato, enviar fotos e informações dos veículos e o convite do feirão (execução de procedimentos preliminares a um contrato, a seu pedido).</li>
            <li>Encaminhar seu atendimento para a loja que tem o carro do seu interesse e agendar sua visita.</li>
            <li>Enviar avisos sobre o feirão e sobre o carro que você procura, quando você pede para ser avisado (consentimento).</li>
            <li>Medir os resultados das nossas campanhas e melhorar os anúncios (legítimo interesse), de forma agregada ou com dados protegidos por criptografia (hash).</li>
          </ul>
        </Secao>

        <Secao id="whatsapp" titulo="4. Atendimento pelo WhatsApp e assistente virtual">
          <p>
            Nosso atendimento no WhatsApp funciona 24 horas com um <b>assistente virtual baseado em inteligência artificial</b>, que responde dúvidas,
            consulta o estoque das lojas e organiza as informações do seu interesse. Um consultor humano da loja pode assumir a conversa a qualquer
            momento, e você pode pedir para falar com uma pessoa.
          </p>
          <p>
            O assistente classifica o atendimento (por exemplo, se você já tem um carro e prazo definidos) apenas para priorizar e direcionar seu
            atendimento à loja certa. Essa classificação não gera nenhuma decisão sobre crédito ou aprovação de financiamento, que é feita
            exclusivamente pelas instituições financeiras, mediante sua solicitação.
          </p>
          <p>
            Para parar de receber mensagens, basta responder <b>“parar”</b> a qualquer momento.
          </p>
        </Secao>

        <Secao id="compartilhamento" titulo="5. Com quem compartilhamos">
          <p>Não vendemos seus dados. Eles são compartilhados apenas quando necessário para as finalidades acima:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li><b>Lojas participantes:</b> a loja responsável pelo seu atendimento recebe seu nome, telefone e as informações do seu interesse.</li>
            <li>
              <b>Prestadores de serviço (operadores):</b> hospedagem do site e banco de dados, plataforma de envio de mensagens do WhatsApp e o
              provedor de inteligência artificial que processa as mensagens do assistente virtual. Esses fornecedores tratam os dados apenas
              para prestar o serviço a nós.
            </li>
            <li>
              <b>Meta (Facebook e Instagram):</b> para medir e otimizar anúncios, enviamos eventos como “lead” ou “lead qualificado” com seu
              telefone e primeiro nome criptografados (hash), sem o conteúdo das conversas.
            </li>
            <li><b>Instituições financeiras:</b> somente se você solicitar uma simulação ou financiamento, e a partir da sua solicitação na loja.</li>
            <li><b>Autoridades:</b> quando exigido por lei ou ordem judicial.</li>
          </ul>
          <p>Alguns desses fornecedores podem armazenar dados fora do Brasil, sempre com as salvaguardas exigidas pela LGPD.</p>
        </Secao>

        <Secao id="cookies" titulo="6. Cookies e anúncios">
          <p>
            Usamos cookies e tecnologias semelhantes do Meta Pixel e do Google Analytics para entender como o site é usado e para medir e
            personalizar anúncios. Você pode bloquear ou apagar cookies nas configurações do seu navegador e ajustar suas preferências de
            anúncios nas configurações do Facebook, do Instagram e da sua conta Google.
          </p>
        </Secao>

        <Secao id="retencao" titulo="7. Por quanto tempo guardamos">
          <ul className="list-disc space-y-2 pl-5">
            <li>Dados de contato e conversas: enquanto houver relacionamento comercial e por até 24 meses após o último contato, salvo obrigação legal de guarda por prazo maior.</li>
            <li>Registros de cliques usados para atribuição de campanhas: até 30 dias.</li>
            <li>Quando você pede para não receber mensagens, guardamos apenas o registro desse pedido, para garantir que ele seja respeitado.</li>
          </ul>
        </Secao>

        <Secao id="direitos" titulo="8. Seus direitos">
          <p>Pela LGPD (art. 18), você pode, a qualquer momento e sem custo:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>confirmar se tratamos seus dados e acessá-los;</li>
            <li>corrigir dados incompletos, inexatos ou desatualizados;</li>
            <li>pedir a anonimização, o bloqueio ou a eliminação de dados desnecessários;</li>
            <li>pedir a portabilidade dos seus dados;</li>
            <li>revogar o consentimento e pedir a eliminação dos dados tratados com base nele;</li>
            <li>saber com quem compartilhamos seus dados;</li>
            <li>apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).</li>
          </ul>
        </Secao>

        <Secao id="exclusao" titulo="9. Como excluir seus dados">
          <p>Para pedir a exclusão dos seus dados pessoais:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Envie uma mensagem para o nosso {contato} com o texto <b>“excluir meus dados”</b>, a partir do número que você usou conosco.</li>
            <li>Confirmaremos o pedido pelo mesmo canal.</li>
            <li>Os dados serão excluídos em até 15 dias, exceto os que a lei nos obrigue a manter. Você receberá a confirmação da exclusão.</li>
          </ol>
          <p>Se você só quer parar de receber mensagens, basta responder “parar” no WhatsApp.</p>
        </Secao>

        <Secao id="seguranca" titulo="10. Segurança">
          <p>
            Adotamos medidas técnicas e administrativas para proteger seus dados: conexão criptografada (HTTPS), acesso ao painel de atendimento
            restrito por usuário e senha, com cada loja vendo apenas os próprios atendimentos, banco de dados sem acesso público e envio de dados
            criptografados (hash) às plataformas de anúncio.
          </p>
        </Secao>

        <Secao id="contato" titulo="11. Contato">
          <p>
            Dúvidas, pedidos ou solicitações sobre seus dados pessoais: {contato}. Esta política pode ser atualizada, e a data da última
            atualização estará sempre no topo desta página.
          </p>
        </Secao>

        <p className="mt-12">
          <Link href="/" className="font-bold text-orange-700 underline">← Voltar para o Acelera V3</Link>
        </p>
      </article>
    </main>
  );
}
