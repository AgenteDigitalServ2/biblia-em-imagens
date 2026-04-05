import React, { useState, useEffect } from "react";
import { Book, ChevronRight, Heart, History, Share2, Sparkles, Trash2, Download, Image as ImageIcon, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { BIBLE_BOOKS } from "./constants";
import { BiblePassage, GeneratedImage } from "./types";
import { generateVisualPrompt, generateImageFromPrompt, generateMetadata } from "./services/geminiService";
import { cn } from "./lib/utils";
import { overlayTextOnImage } from "./lib/imageUtils";

export default function App() {
  const [selectedBook, setSelectedBook] = useState(BIBLE_BOOKS[0]);
  const [chapter, setChapter] = useState(1);
  const [verse, setVerse] = useState(1);
  const [loading, setLoading] = useState(false);
  const [currentImage, setCurrentImage] = useState<GeneratedImage | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  // Load history from local storage
  useEffect(() => {
    const savedHistory = localStorage.getItem("bible_image_history");
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Erro ao carregar histórico:", e);
      }
    }
  }, []);

  // Save history to local storage
  useEffect(() => {
    localStorage.setItem("bible_image_history", JSON.stringify(history));
  }, [history]);

  // Watermark URL - User should replace this with their actual watermark image path or base64
  const WATERMARK_URL = "https://i.imgur.com/placeholder.png"; // Placeholder

  const handleGenerate = async () => {
    setErrorStatus(null);
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      setErrorStatus("Chave de API não configurada no Vercel. Adicione GEMINI_API_KEY às variáveis de ambiente.");
      return;
    }

    if (!key.startsWith("AIza")) {
      setErrorStatus("A chave de API parece estar no formato incorreto. Ela deve começar com 'AIza'.");
      return;
    }

    setLoading(true);
    try {
      const passage: BiblePassage = {
        book: selectedBook.name,
        chapter,
        verse,
      };

      // Step 1: Generate Text and Visual Prompt
      let textResult;
      try {
        textResult = await generateVisualPrompt(passage);
      } catch (e: any) {
        throw new Error(`Erro no texto: ${e.message || "Falha ao obter versículo"}`);
      }

      const { text, visualPrompt } = textResult;

      // Small delay to avoid hitting rate limits between text and image generation
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 2: Generate Image
      let rawImageUrl;
      try {
        rawImageUrl = await generateImageFromPrompt(visualPrompt);
      } catch (e: any) {
        throw new Error(`Erro na imagem: ${e.message || "Falha ao gerar arte"}`);
      }

      const metadata = generateMetadata(passage, text);
      
      // Step 3: Overlay Text
      let imageUrl;
      try {
        imageUrl = await overlayTextOnImage(rawImageUrl, text, metadata.shortCitation, WATERMARK_URL);
      } catch (e: any) {
        console.warn("Falha no overlay, usando imagem pura:", e);
        imageUrl = rawImageUrl;
      }

      const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2);
      
      const newImage: GeneratedImage = {
        id,
        timestamp: Date.now(),
        passage: { ...passage, text },
        prompt: visualPrompt,
        imageUrl,
        isFavorite: false,
        metadata,
      };

      setCurrentImage(newImage);
      setHistory((prev) => [newImage, ...prev]);

      // Scroll to preview on mobile
      if (window.innerWidth < 1024) {
        setTimeout(() => {
          const previewElement = document.getElementById("image-preview");
          if (previewElement) {
            previewElement.scrollIntoView({ behavior: "smooth" });
          }
        }, 500);
      }
    } catch (error: any) {
      console.error("Erro ao gerar imagem:", error);
      const errorMessage = error?.message || "Erro desconhecido";
      
      if (errorMessage.includes("Quota exceeded") || errorMessage.includes("429")) {
        if (errorMessage.includes("Erro no texto")) {
          setErrorStatus("Limite de cota de texto atingido. Tente novamente em 1 minuto.");
        } else if (errorMessage.includes("Erro na imagem")) {
          setErrorStatus("Limite de cota de imagem atingido. O Google limita a geração de imagens no plano gratuito. Tente novamente mais tarde ou ative o faturamento (Pay-as-you-go) no Google AI Studio.");
        } else {
          setErrorStatus("Limite de uso atingido. Por favor, aguarde alguns minutos.");
        }
      } else if (errorMessage.includes("API key not valid")) {
        setErrorStatus("Chave de API inválida. Verifique se a chave no Vercel está correta.");
      } else if (errorMessage.includes("Safety") || errorMessage.includes("blocked")) {
        setErrorStatus("O conteúdo foi bloqueado pelos filtros de segurança da IA. Tente outro versículo.");
      } else {
        setErrorStatus(`Erro: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = (id: string) => {
    setHistory((prev) =>
      prev.map((img) =>
        img.id === id ? { ...img, isFavorite: !img.isFavorite } : img
      )
    );
    if (currentImage?.id === id) {
      setCurrentImage((prev) => prev ? { ...prev, isFavorite: !prev.isFavorite } : null);
    }
  };

  const deleteFromHistory = (id: string) => {
    setHistory((prev) => prev.filter((img) => img.id !== id));
    if (currentImage?.id === id) {
      setCurrentImage(null);
    }
  };

  const handleDownload = (img: GeneratedImage) => {
    const link = document.createElement("a");
    link.href = img.imageUrl;
    link.download = `${img.metadata.shortCitation.replace(/[:\s]/g, "_")}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async (img: GeneratedImage) => {
    const text = `${img.metadata.shortCitation}\n\n"${img.passage.text}"\n\n${img.metadata.hashtags.join(" ")}`;
    
    try {
      if (navigator.share) {
        const shareData: ShareData = {
          title: "Bíblia em Imagens",
          text,
          url: window.location.href,
        };

        // Try to share as file if it's a data URL
        if (img.imageUrl.startsWith("data:")) {
          const response = await fetch(img.imageUrl);
          const blob = await response.blob();
          const file = new File([blob], `${img.metadata.shortCitation}.png`, { type: "image/png" });
          
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            shareData.files = [file];
          }
        }

        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(text);
        alert("Citação e hashtags copiadas para a área de transferência!");
      }
    } catch (error) {
      console.error("Erro ao compartilhar:", error);
      // Fallback to clipboard if share fails
      navigator.clipboard.writeText(text);
      alert("Citação e hashtags copiadas!");
    }
  };

  return (
    <div className="min-h-screen bg-parchment-50 text-biblical-ink font-serif">
      {/* Header */}
      <header className="bg-parchment-100 border-b border-parchment-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-biblical-red p-2.5 rounded-lg shadow-md">
              <Book className="w-6 h-6 text-parchment-50" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-widest uppercase text-biblical-red leading-tight">Bíblia</h1>
              <p className="text-[10px] font-display tracking-[0.3em] uppercase text-biblical-gold">Em Imagens</p>
            </div>
            <div className="hidden sm:block ml-4 pl-4 border-l border-parchment-200">
              <img 
                src={WATERMARK_URL} 
                alt="A Palavra Diária" 
                className="h-12 w-auto opacity-80 hover:opacity-100 transition-opacity"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            </div>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="p-3 hover:bg-parchment-200 rounded-full transition-colors relative group"
          >
            <History className="w-6 h-6 text-biblical-ink group-hover:text-biblical-red transition-colors" />
            {history.length > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-biblical-red rounded-full border-2 border-parchment-100" />
            )}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Controls */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-parchment-100 p-8 rounded-2xl shadow-md border border-parchment-200 space-y-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-biblical-gold opacity-50" />
              
              <h2 className="text-xl font-bold flex items-center gap-2 text-biblical-red">
                <Sparkles className="w-5 h-5" />
                Nova Revelação
              </h2>
              
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-display uppercase tracking-wider text-biblical-gold mb-1.5 block">Livro Sagrado</label>
                  <select
                    value={selectedBook.name}
                    onChange={(e) => {
                      const book = BIBLE_BOOKS.find(b => b.name === e.target.value);
                      if (book) {
                        setSelectedBook(book);
                        setChapter(1);
                        setVerse(1);
                      }
                    }}
                    className="w-full bg-parchment-50 border border-parchment-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-biblical-gold outline-none font-serif text-lg shadow-inner"
                  >
                    {BIBLE_BOOKS.map(book => (
                      <option key={book.name} value={book.name}>{book.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-display uppercase tracking-wider text-biblical-gold mb-1.5 block">Capítulo</label>
                    <input
                      type="number"
                      min={1}
                      max={selectedBook.chapters}
                      value={chapter}
                      onChange={(e) => setChapter(Number(e.target.value))}
                      className="w-full bg-parchment-50 border border-parchment-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-biblical-gold outline-none font-serif text-lg shadow-inner"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-display uppercase tracking-wider text-biblical-gold mb-1.5 block">Versículo</label>
                    <input
                      type="number"
                      min={1}
                      value={verse}
                      onChange={(e) => setVerse(Number(e.target.value))}
                      className="w-full bg-parchment-50 border border-parchment-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-biblical-gold outline-none font-serif text-lg shadow-inner"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  {errorStatus && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="bg-biblical-red/10 border border-biblical-red/20 p-4 rounded-xl text-biblical-red text-sm italic text-center flex flex-col items-center gap-2"
                    >
                      <span>{errorStatus}</span>
                      <button 
                        onClick={() => setErrorStatus(null)}
                        className="text-[10px] uppercase tracking-widest font-display hover:underline"
                      >
                        Limpar Aviso
                      </button>
                    </motion.div>
                  )}

                  <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="w-full bg-biblical-red hover:bg-red-900 disabled:bg-stone-300 text-parchment-50 font-display uppercase tracking-widest py-4 rounded-xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-biblical-red/20 active:scale-[0.98]"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Manifestando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Gerar Visão
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Favorites Preview */}
            <div className="bg-parchment-100 p-6 rounded-2xl shadow-md border border-parchment-200">
              <h2 className="text-sm font-display uppercase tracking-wider text-biblical-gold mb-4 flex items-center gap-2">
                <Heart className="w-4 h-4 text-biblical-red fill-biblical-red" />
                Favoritos
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {history.filter(h => h.isFavorite).slice(0, 4).map(fav => (
                  <button
                    key={fav.id}
                    onClick={() => setCurrentImage(fav)}
                    className="aspect-square rounded-lg overflow-hidden border border-parchment-200 hover:opacity-80 transition-opacity shadow-sm"
                  >
                    <img src={fav.imageUrl} alt={fav.passage.book} className="w-full h-full object-cover" />
                  </button>
                ))}
                {history.filter(h => h.isFavorite).length === 0 && (
                  <p className="col-span-2 text-xs font-display uppercase tracking-widest text-parchment-400 text-center py-4">Nenhum favorito ainda.</p>
                )}
              </div>
            </div>
          </div>

          {/* Main Content / Preview */}
          <div className="lg:col-span-8" id="image-preview">
            <AnimatePresence mode="wait">
              {currentImage ? (
                <motion.div
                  key={currentImage.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6"
                >
                  <div className="bg-parchment-100 rounded-3xl overflow-hidden shadow-2xl border-4 border-parchment-100 relative group">
                    <div className="aspect-[9/16] max-h-[70vh] relative bg-parchment-200">
                      <img
                        src={currentImage.imageUrl}
                        alt={currentImage.metadata.shortCitation}
                        className="w-full h-full object-contain"
                      />
                      {/* Watermark Overlay in Preview */}
                      <div className="absolute top-4 right-4 pointer-events-none">
                        <img 
                          src={WATERMARK_URL} 
                          alt="" 
                          className="w-16 h-16 opacity-40"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-biblical-ink/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-8">
                        <div className="flex gap-3 w-full justify-end">
                          <button
                            onClick={() => toggleFavorite(currentImage.id)}
                            className={cn(
                              "p-4 rounded-full backdrop-blur-md transition-all transform hover:scale-110",
                              currentImage.isFavorite ? "bg-biblical-red text-parchment-50" : "bg-white/20 text-white hover:bg-white/40"
                            )}
                          >
                            <Heart className={cn("w-6 h-6", currentImage.isFavorite && "fill-current")} />
                          </button>
                          <button
                            onClick={() => handleShare(currentImage)}
                            className="p-4 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-all transform hover:scale-110"
                          >
                            <Share2 className="w-6 h-6" />
                          </button>
                          <button
                            onClick={() => handleDownload(currentImage)}
                            className="p-4 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-all transform hover:scale-110"
                          >
                            <Download className="w-6 h-6" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Mobile Actions Bar */}
                    <div className="flex lg:hidden justify-center gap-4 py-4 bg-parchment-200/50 border-t border-parchment-200">
                      <button
                        onClick={() => toggleFavorite(currentImage.id)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-full font-display text-xs uppercase tracking-wider transition-all",
                          currentImage.isFavorite ? "bg-biblical-red text-parchment-50" : "bg-parchment-100 text-biblical-ink"
                        )}
                      >
                        <Heart className={cn("w-4 h-4", currentImage.isFavorite && "fill-current")} />
                        {currentImage.isFavorite ? "Salvo" : "Salvar"}
                      </button>
                      <button
                        onClick={() => handleShare(currentImage)}
                        className="flex items-center gap-2 px-4 py-2 bg-parchment-100 text-biblical-ink rounded-full font-display text-xs uppercase tracking-wider"
                      >
                        <Share2 className="w-4 h-4" />
                        Compartilhar
                      </button>
                      <button
                        onClick={() => handleDownload(currentImage)}
                        className="flex items-center gap-2 px-4 py-2 bg-parchment-100 text-biblical-ink rounded-full font-display text-xs uppercase tracking-wider"
                      >
                        <Download className="w-4 h-4" />
                        Baixar
                      </button>
                    </div>
                    
                    <div className="p-10 space-y-8 relative">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-parchment-100 rounded-full border-4 border-parchment-50 flex items-center justify-center shadow-lg">
                        <Sparkles className="w-8 h-8 text-biblical-gold" />
                      </div>

                      <div className="text-center">
                        <h3 className="text-3xl font-bold text-biblical-red italic font-accent">{currentImage.metadata.shortCitation}</h3>
                        <p className="text-parchment-400 text-xs font-display uppercase tracking-widest mt-1">Revelado em {new Date(currentImage.timestamp).toLocaleDateString()}</p>
                      </div>

                      <blockquote className="relative px-8">
                        <span className="absolute top-0 left-0 text-6xl text-biblical-gold opacity-20 font-serif">"</span>
                        <p className="text-2xl italic text-biblical-ink leading-relaxed font-serif text-center">
                          {currentImage.passage.text}
                        </p>
                        <span className="absolute bottom-0 right-0 text-6xl text-biblical-gold opacity-20 font-serif">"</span>
                      </blockquote>

                      <div className="space-y-4">
                        <h4 className="text-[10px] font-display uppercase tracking-[0.3em] text-biblical-gold text-center">Prompt de Visão</h4>
                        <p className="text-sm text-biblical-ink/70 leading-relaxed bg-parchment-50 p-6 rounded-2xl border border-parchment-200 italic text-center">
                          {currentImage.prompt}
                        </p>
                      </div>

                      <div className="flex flex-wrap justify-center gap-2">
                        {currentImage.metadata.hashtags.map(tag => (
                          <span key={tag} className="text-[10px] font-display uppercase tracking-widest text-biblical-red bg-parchment-200 px-3 py-1 rounded-full border border-parchment-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="h-[600px] flex flex-col items-center justify-center text-parchment-300 border-4 border-double border-parchment-200 rounded-3xl bg-parchment-100/50 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#b8860b 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                  <ImageIcon className="w-20 h-20 mb-6 opacity-20" />
                  <p className="text-xl font-display uppercase tracking-[0.2em] text-biblical-gold">Aguardando Revelação</p>
                  <p className="text-sm italic mt-2">"A fé é a certeza daquilo que se espera..."</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-biblical-ink/40 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-parchment-50 shadow-2xl z-50 overflow-hidden flex flex-col border-l border-parchment-200"
            >
              <div className="p-8 border-b border-parchment-200 flex items-center justify-between bg-parchment-100">
                <h2 className="text-2xl font-bold text-biblical-red">Crônicas de Visões</h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-parchment-200 rounded-full transition-colors"
                >
                  <ChevronRight className="w-8 h-8" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {history.map((img) => (
                  <div
                    key={img.id}
                    className="group relative bg-parchment-100 rounded-2xl overflow-hidden border border-parchment-200 hover:border-biblical-gold transition-all shadow-sm"
                  >
                    <div className="flex gap-6 p-4">
                      <button
                        onClick={() => {
                          setCurrentImage(img);
                          setShowHistory(false);
                        }}
                        className="w-28 h-28 rounded-xl overflow-hidden flex-shrink-0 shadow-md"
                      >
                        <img src={img.imageUrl} alt={img.metadata.shortCitation} className="w-full h-full object-cover" />
                      </button>
                      <div className="flex-1 min-w-0 py-1">
                        <h4 className="font-bold text-biblical-red italic text-lg truncate">{img.metadata.shortCitation}</h4>
                        <p className="text-[10px] font-display uppercase tracking-widest text-parchment-400 mb-3">{new Date(img.timestamp).toLocaleString()}</p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => toggleFavorite(img.id)}
                            className={cn(
                              "p-2 rounded-lg transition-colors",
                              img.isFavorite ? "text-biblical-red bg-parchment-200" : "text-parchment-400 hover:bg-parchment-200"
                            )}
                          >
                            <Heart className={cn("w-5 h-5", img.isFavorite && "fill-current")} />
                          </button>
                          <button
                            onClick={() => handleShare(img)}
                            className="p-2 text-parchment-400 hover:bg-parchment-200 rounded-lg transition-colors"
                          >
                            <Share2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => deleteFromHistory(img.id)}
                            className="p-2 text-parchment-400 hover:text-biblical-red hover:bg-parchment-200 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="text-center py-24 text-parchment-300">
                    <History className="w-16 h-16 mx-auto mb-6 opacity-10" />
                    <p className="font-display uppercase tracking-widest text-xs">Nenhuma visão registrada</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
