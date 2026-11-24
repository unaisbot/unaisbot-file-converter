/* UnaisBot File Converter — browser-side processing */
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const $ = id => document.getElementById(id);
const modal = $("modal"), fileInput = $("fileInput"), dropzone = $("dropzone");
let activeTool = null, selectedFiles = [];
const configs = {
  docx:{title:"Word to PDF",desc:"Convert a DOCX document into a PDF.",accept:".docx",multiple:false,label:"DOCX documents",button:"Convert to PDF"},
  jpg:{title:"PDF to JPG",desc:"Convert each page of a PDF into a JPG image.",accept:".pdf",multiple:false,label:"PDF documents",button:"Convert to JPG"},
  png:{title:"PDF to PNG",desc:"Convert each page of a PDF into a PNG image.",accept:".pdf",multiple:false,label:"PDF documents",button:"Convert to PNG"},
  images:{title:"Images to PDF",desc:"Combine multiple JPG and PNG images into one PDF.",accept:"image/jpeg,image/png",multiple:true,label:"JPG and PNG images",button:"Create PDF"},
  merge:{title:"Merge PDF",desc:"Combine two or more PDF documents into one file.",accept:".pdf",multiple:true,label:"PDF documents",button:"Merge PDFs"},
  split:{title:"Split PDF",desc:"Extract a range of pages into a new PDF.",accept:".pdf",multiple:false,label:"PDF documents",button:"Extract pages"}
};
document.querySelectorAll("[data-tool]").forEach(b=>b.addEventListener("click",()=>openTool(b.dataset.tool)));
$("year").textContent = new Date().getFullYear();
$("closeModal").onclick = closeTool;
modal.addEventListener("click",e=>{if(e.target===modal)closeTool()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeTool()});
function openTool(key){
  activeTool=key; selectedFiles=[]; const c=configs[key];
  $("modalTitle").textContent=c.title; $("modalDescription").textContent=c.desc;
  fileInput.accept=c.accept; fileInput.multiple=c.multiple; fileInput.value="";
  $("acceptedTypes").textContent=c.label; $("convertBtn").textContent=c.button+"  →";
  $("convertBtn").disabled=true; $("selectedFiles").innerHTML=""; $("options").innerHTML="";
  $("result").innerHTML=""; $("progressWrap").classList.remove("show");
  if(key==="split") $("options").innerHTML='<label>Pages (e.g. 1-3,5): <input id="pageRange" type="text" placeholder="1-3"></label>';
  if(key==="jpg"||key==="png") $("options").innerHTML='<label>Image quality: <select id="scale"><option value="1.5">Standard</option><option value="2">High</option><option value="3">Very high</option></select></label>';
  if(key==="docx") $("options").innerHTML='<span>Basic document layout is supported. Complex Word formatting may differ.</span>';
  modal.classList.add("open"); modal.setAttribute("aria-hidden","false");
}
function closeTool(){modal.classList.remove("open");modal.setAttribute("aria-hidden","true")}
dropzone.onclick=()=>fileInput.click();
dropzone.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();fileInput.click()}};
["dragenter","dragover"].forEach(n=>dropzone.addEventListener(n,e=>{e.preventDefault();dropzone.classList.add("drag")}));
["dragleave","drop"].forEach(n=>dropzone.addEventListener(n,e=>{e.preventDefault();dropzone.classList.remove("drag")}));
dropzone.addEventListener("drop",e=>addFiles([...e.dataTransfer.files]));
fileInput.addEventListener("change",()=>addFiles([...fileInput.files]));
function addFiles(files){
  if(!activeTool)return; const c=configs[activeTool];
  const valid=files.filter(f=>activeTool==="images"?/^image\/(jpeg|png)$/.test(f.type):activeTool==="docx"?f.name.toLowerCase().endsWith(".docx"):f.type==="application/pdf"||f.name.toLowerCase().endsWith(".pdf"));
  if(!valid.length){$("result").textContent="Please choose a supported file type.";return}
  selectedFiles=c.multiple?[...selectedFiles,...valid]:[valid[0]];
  renderFiles(); $("convertBtn").disabled=selectedFiles.length===0;
}
function renderFiles(){
  $("selectedFiles").innerHTML=selectedFiles.map((f,i)=>`<div class="file-row"><span>📄 ${escapeHtml(f.name)} · ${formatSize(f.size)}</span><button data-remove="${i}" aria-label="Remove file">×</button></div>`).join("");
  $("selectedFiles").querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{selectedFiles.splice(+b.dataset.remove,1);renderFiles();$("convertBtn").disabled=!selectedFiles.length});
}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function formatSize(n){return n<1024*1024?(n/1024).toFixed(1)+" KB":(n/1024/1024).toFixed(2)+" MB"}
$("resetBtn").onclick=()=>{selectedFiles=[];fileInput.value="";renderFiles();$("convertBtn").disabled=true;$("result").innerHTML="";$("progressWrap").classList.remove("show")};
$("convertBtn").onclick=async()=>{
  if(!selectedFiles.length)return;
  $("convertBtn").disabled=true;$("result").innerHTML="";$("progressWrap").classList.add("show");setProgress(5,"Preparing files…");
  try{
    if(activeTool==="jpg"||activeTool==="png")await pdfToImages(selectedFiles[0],activeTool);
    else if(activeTool==="images")await imagesToPdf(selectedFiles);
    else if(activeTool==="merge")await mergePdfs(selectedFiles);
    else if(activeTool==="split")await splitPdf(selectedFiles[0]);
    else if(activeTool==="docx")await docxToPdf(selectedFiles[0]);
    setProgress(100,"Completed");
  }catch(err){console.error(err);$("result").innerHTML='<span style="color:#d04444">Conversion failed: '+escapeHtml(err.message||"Please check your file and try again.")+'</span>'}
  finally{$("convertBtn").disabled=false}
};
function setProgress(n,t){$("progressBar").style.width=n+"%";$("progressText").textContent=t}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function addDownload(name,blob){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.textContent="↓ Download "+name;a.className="download-link";$("result").appendChild(a)}
async function pdfToImages(file,format){
  const data=new Uint8Array(await file.arrayBuffer());const pdf=await pdfjsLib.getDocument({data}).promise;const zip=new JSZip();const scale=+$("scale").value||1.5;
  for(let i=1;i<=pdf.numPages;i++){setProgress(5+Math.round(i/pdf.numPages*85),`Rendering page ${i} of ${pdf.numPages}…`);const page=await pdf.getPage(i);const viewport=page.getViewport({scale});const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;const blob=await new Promise(r=>canvas.toBlob(r,format==="jpg"?"image/jpeg":"image/png",.92));zip.file(`page-${String(i).padStart(3,"0")}.${format}`,blob);canvas.width=canvas.height=1}
  const out=await zip.generateAsync({type:"blob"});addDownload(file.name.replace(/\.pdf$/i,"")+"-"+format+"-images.zip",out);
}
async function imagesToPdf(files){
  const {PDFDocument}=PDFLib;const pdf=await PDFDocument.create();
  for(let i=0;i<files.length;i++){setProgress(10+Math.round(i/files.length*80),`Adding image ${i+1} of ${files.length}…`);const bytes=await files[i].arrayBuffer();const img=files[i].type==="image/png"?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);const page=pdf.addPage([img.width,img.height]);page.drawImage(img,{x:0,y:0,width:img.width,height:img.height})}
  addDownload("images-combined.pdf",new Blob([await pdf.save()],{type:"application/pdf"}));
}
async function mergePdfs(files){
  const {PDFDocument}=PDFLib;const out=await PDFDocument.create();
  for(let i=0;i<files.length;i++){setProgress(10+Math.round(i/files.length*80),`Merging file ${i+1} of ${files.length}…`);const src=await PDFDocument.load(await files[i].arrayBuffer());const pages=await out.copyPages(src,src.getPageIndices());pages.forEach(p=>out.addPage(p))}
  addDownload("merged-document.pdf",new Blob([await out.save()],{type:"application/pdf"}));
}
async function splitPdf(file){
  const {PDFDocument}=PDFLib;const src=await PDFDocument.load(await file.arrayBuffer());const raw=$("pageRange").value.trim();if(!raw)throw Error("Enter page numbers, for example 1-3,5.");
  const indexes=new Set();raw.split(",").forEach(part=>{const p=part.trim();if(/^\d+$/.test(p))indexes.add(+p-1);else if(/^\d+-\d+$/.test(p)){let [a,b]=p.split("-").map(Number);if(a>b)[a,b]=[b,a];for(let n=a;n<=b;n++)indexes.add(n-1)}else throw Error("Invalid page range. Use a format such as 1-3,5.")});
  const list=[...indexes].sort((a,b)=>a-b);if(!list.length||list.some(n=>n<0||n>=src.getPageCount()))throw Error(`Choose pages between 1 and ${src.getPageCount()}.`);
  const out=await PDFDocument.create();const pages=await out.copyPages(src,list);pages.forEach(p=>out.addPage(p));addDownload("extracted-pages.pdf",new Blob([await out.save()],{type:"application/pdf"}));
}
async function docxToPdf(file){
  if(!window.mammoth||!window.html2pdf)throw Error("Document conversion libraries did not load. Refresh and try again.");
  const arrayBuffer=await file.arrayBuffer();setProgress(30,"Reading Word document…");
  const result=await mammoth.convertToHtml({arrayBuffer});const container=document.createElement("div");container.className="docx-render";container.innerHTML=result.value;
  container.style.cssText="position:fixed;left:-10000px;top:0;width:760px;padding:38px;background:white;color:#111;font:12pt Arial;line-height:1.5";
  container.querySelectorAll("img").forEach(img=>img.style.maxWidth="100%");document.body.appendChild(container);setProgress(60,"Creating PDF…");
  try{const blob=await html2pdf().set({margin:12,filename:"converted.pdf",image:{type:"jpeg",quality:.95},html2canvas:{scale:1.5,useCORS:true},jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}}).from(container).output("blob");addDownload(file.name.replace(/\.docx$/i,"")+".pdf",blob)}
  finally{container.remove()}
}
