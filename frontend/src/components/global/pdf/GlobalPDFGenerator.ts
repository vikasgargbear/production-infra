import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { companyAPI } from '../../../services/api';

interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  gst: string;
  website?: string;
}

interface PartyDetails {
  name: string;
  phone?: string;
  address?: string;
  gst?: string;
  email?: string;
}

interface SummaryData {
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  currency?: string;
}

type Theme = 'digital' | 'print';
type PartyType = 'customer' | 'supplier';

/**
 * Global PDF Generator with consistent branding and themes
 * Provides two templates: Print (minimal) and Digital (branded)
 */
class GlobalPDFGenerator {
  doc: jsPDF;
  theme: Theme;
  companyInfo: CompanyInfo;
  colors: Record<Theme, Record<string, number[]>>;
  constructor(theme: Theme = 'digital') {
    this.doc = new jsPDF();
    this.theme = theme; // 'print' or 'digital'
    this.companyInfo = {
      name: 'Your Company Name',
      address: '123 Business Street, City, State 12345',
      phone: '+91 98765 43210',
      email: 'info@company.com',
      gst: '29ABCDE1234F1Z5',
      website: 'www.company.com'
    };
    this.colors = {
      digital: {
        primary: [59, 130, 246], // Blue
        secondary: [99, 102, 241], // Indigo
        accent: [16, 185, 129], // Green
        dark: [31, 41, 55], // Gray-800
        light: [243, 244, 246], // Gray-100
        white: [255, 255, 255],
        text: [17, 24, 39], // Gray-900
        textLight: [107, 114, 128], // Gray-500
        success: [16, 185, 129],
        warning: [245, 158, 11],
        danger: [239, 68, 68]
      },
      print: {
        primary: [0, 0, 0], // Black
        secondary: [75, 85, 99], // Gray-600
        accent: [31, 41, 55], // Gray-800
        dark: [0, 0, 0],
        light: [249, 250, 251], // Gray-50
        white: [255, 255, 255],
        text: [0, 0, 0],
        textLight: [107, 114, 128],
        success: [0, 0, 0],
        warning: [0, 0, 0],
        danger: [0, 0, 0]
      }
    };
  }

  /**
   * Helper method to apply color arrays
   */
  private applyColor(method: 'setTextColor' | 'setFillColor' | 'setDrawColor', color: number[]): void {
    (this.doc as any)[method](color[0], color[1], color[2]);
  }

  /**
   * Initialize PDF with company info
   */
  async init(theme: Theme = 'digital', orientation: 'portrait' | 'landscape' = 'portrait'): Promise<this> {
    this.theme = theme;
    this.doc = new jsPDF(orientation);
    
    // Load company info
    try {
      const response = await companyAPI.getCompanyInfo();
      this.companyInfo = response.data || {
        name: 'Your Company Name',
        address: 'Your Address',
        phone: 'Your Phone',
        email: 'your@email.com',
        gst: 'Your GST Number',
        website: 'www.yourcompany.com'
      };
    } catch (error) {
      console.error('Error loading company info:', error);
      this.companyInfo = {
        name: 'Your Company Name',
        address: '123 Business Street, City, State 12345',
        phone: '+91 98765 43210',
        email: 'info@company.com',
        gst: '29ABCDE1234F1Z5',
        website: 'www.company.com'
      };
    }
    
    return this;
  }

  /**
   * Add branded header with logo and company info
   */
  addHeader(title: string, subtitle: string = ''): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    
    if (this.theme === 'digital') {
      // Digital theme - colorful header
      // Add gradient background
      this.doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      this.doc.rect(0, 0, pageWidth, 45, 'F');
      
      // Add secondary accent
      this.doc.setFillColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      this.doc.rect(0, 40, pageWidth, 5, 'F');
      
      // Company name - large and bold
      this.applyColor('setTextColor', colors.white);
      this.doc.setFontSize(24);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(this.companyInfo.name, 15, 20);
      
      // Document title
      this.doc.setFontSize(14);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(title, 15, 30);
      
      if (subtitle) {
        this.doc.setFontSize(10);
        this.doc.text(subtitle, 15, 36);
      }
      
      // Company contact info on the right
      this.doc.setFontSize(9);
      this.doc.setFont('helvetica', 'normal');
      const contactInfo = [
        this.companyInfo.phone,
        this.companyInfo.email,
        this.companyInfo.website
      ];
      
      let yPos = 15;
      contactInfo.forEach(info => {
        const textWidth = this.doc.getTextWidth(info);
        this.doc.text(info, pageWidth - textWidth - 15, yPos);
        yPos += 5;
      });
      
      // Add decorative elements
      this.applyColor('setDrawColor', colors.accent);
      this.doc.setLineWidth(0.5);
      this.doc.line(15, 47, pageWidth - 15, 47);
      
      return 55; // Return Y position for content start
    } else {
      // Print theme - minimal header
      this.applyColor('setTextColor', colors.text);
      
      // Company name
      this.doc.setFontSize(16);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(this.companyInfo.name, 15, 15);
      
      // Document title
      this.doc.setFontSize(12);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(title, 15, 22);
      
      if (subtitle) {
        this.doc.setFontSize(10);
        this.doc.text(subtitle, 15, 27);
      }
      
      // Simple line separator
      this.applyColor('setDrawColor', colors.secondary);
      this.doc.setLineWidth(0.2);
      this.doc.line(15, 30, pageWidth - 15, 30);
      
      return 35; // Return Y position for content start
    }
  }

  /**
   * Add customer/party details section
   */
  addPartyDetails(party: PartyDetails, type: PartyType = 'customer', yPos?: number): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    
    if (this.theme === 'digital') {
      // Colored background for party details
      this.applyColor('setFillColor', colors.light);
      this.doc.roundedRect(15, yPos, (pageWidth - 30) / 2 - 5, 35, 3, 3, 'F');
      
      // Label
      this.applyColor('setTextColor', colors.primary);
      this.doc.setFontSize(10);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(type === 'customer' ? 'BILL TO' : 'SUPPLIER', 20, yPos + 7);
      
      // Party details
      this.applyColor('setTextColor', colors.text);
      this.doc.setFontSize(11);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(party.name || 'N/A', 20, yPos + 14);
      
      this.doc.setFontSize(9);
      this.doc.setFont('helvetica', 'normal');
      this.applyColor('setTextColor', colors.textLight);
      
      let detailY = yPos + 20;
      if (party.phone) {
        this.doc.text(`Phone: ${party.phone}`, 20, detailY);
        detailY += 5;
      }
      if (party.address) {
        const lines = this.doc.splitTextToSize(party.address, (pageWidth - 30) / 2 - 15);
        this.doc.text(lines, 20, detailY);
        detailY += lines.length * 4;
      }
      if (party.gst) {
        this.doc.text(`GST: ${party.gst}`, 20, detailY + 2);
      }
    } else {
      // Print theme - simple text
      this.applyColor('setTextColor', colors.text);
      this.doc.setFontSize(10);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(type === 'customer' ? 'Bill To:' : 'Supplier:', 15, yPos);
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(party.name || 'N/A', 15, yPos + 6);
      
      this.doc.setFontSize(9);
      if (party.phone) this.doc.text(party.phone, 15, yPos + 11);
      if (party.address) {
        const lines = this.doc.splitTextToSize(party.address, 80);
        this.doc.text(lines, 15, yPos + 16);
      }
    }
  }

  /**
   * Add document info (invoice number, date, etc.)
   */
  addDocumentInfo(info: any, yPos?: number): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    const xPos = pageWidth / 2 + 10;
    
    if (this.theme === 'digital') {
      // Colored background
      this.applyColor('setFillColor', colors.secondary);
      this.applyColor('setTextColor', colors.white);
      this.doc.roundedRect(xPos, yPos, (pageWidth - 30) / 2 - 5, 35, 3, 3, 'F');
      
      // Document details
      this.doc.setFontSize(10);
      this.doc.setFont('helvetica', 'bold');
      
      const details = [
        { label: info.numberLabel || 'Invoice #', value: info.number },
        { label: 'Date', value: info.date },
        { label: 'Due Date', value: info.dueDate },
        { label: 'Status', value: info.status }
      ].filter(d => d.value);
      
      let detailY = yPos + 8;
      details.forEach(detail => {
        this.doc.text(`${detail.label}:`, xPos + 5, detailY);
        const valueWidth = this.doc.getTextWidth(detail.value);
        this.doc.text(detail.value, pageWidth - 20 - valueWidth, detailY);
        detailY += 7;
      });
    } else {
      // Print theme
      this.applyColor('setTextColor', colors.text);
      this.doc.setFontSize(10);
      this.doc.setFont('helvetica', 'bold');
      
      const details = [
        { label: info.numberLabel || 'Invoice #', value: info.number },
        { label: 'Date', value: info.date },
        { label: 'Due Date', value: info.dueDate }
      ].filter(d => d.value);
      
      let detailY = yPos;
      details.forEach(detail => {
        this.doc.text(`${detail.label}: ${detail.value}`, xPos, detailY);
        detailY += 6;
      });
    }
  }

  /**
   * Add simple table with headers and rows
   */
  addTable(headers: string[], rows: any[][], type: PartyType = 'customer'): void {
    const colors = this.colors[this.theme];
    const yPos = this.doc.lastAutoTable?.finalY || 100;
    
    (this.doc as any).autoTable({
      startY: yPos + 10,
      head: [headers],
      body: rows,
      theme: this.theme === 'digital' ? 'grid' : 'plain',
      headStyles: {
        fillColor: this.theme === 'digital' ? colors.primary : colors.white,
        textColor: this.theme === 'digital' ? colors.white : colors.text,
        fontSize: 10,
        fontStyle: 'bold'
      },
      bodyStyles: {
        textColor: colors.text,
        fontSize: 9
      },
      alternateRowStyles: this.theme === 'digital' ? {
        fillColor: colors.light
      } : {},
      margin: { left: 15, right: 15 }
    });
  }

  /**
   * Add items table with enhanced styling
   */
  addItemsTable(items: any[], columns: any[], yPos?: number): number {
    const colors = this.colors[this.theme];
    
    const tableConfig = {
      startY: yPos,
      head: [columns.map(col => col.header)],
      body: items.map(item => columns.map(col => {
        const value = typeof col.field === 'function' ? col.field(item) : item[col.field];
        return col.format ? col.format(value) : value;
      })),
      theme: this.theme === 'digital' ? 'grid' : 'plain',
      headStyles: {
        fillColor: this.theme === 'digital' ? colors.primary : colors.white,
        textColor: this.theme === 'digital' ? colors.white : colors.text,
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'left'
      },
      bodyStyles: {
        textColor: colors.text,
        fontSize: 9,
        cellPadding: this.theme === 'digital' ? 5 : 3
      },
      alternateRowStyles: this.theme === 'digital' ? {
        fillColor: colors.light
      } : {},
      columnStyles: {},
      margin: { left: 15, right: 15 },
      didDrawPage: (data) => {
        // Add page number
        this.addPageNumber();
      }
    };
    
    // Set column alignments
    columns.forEach((col, index) => {
      if (col.align) {
        tableConfig.columnStyles[index] = { halign: col.align };
      }
    });
    
    this.doc.autoTable(tableConfig);
    
    return this.doc.lastAutoTable.finalY;
  }

  /**
   * Add summary section with totals
   */
  addSummary(summary: SummaryData, yPos?: number): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    
    if (this.theme === 'digital') {
      // Gradient background for summary
      const gradient = this.doc.linearGradient(pageWidth - 100, yPos, pageWidth - 15, yPos + 60);
      gradient.addColorStop(0, colors.primary);
      gradient.addColorStop(1, colors.secondary);
      
      this.applyColor('setFillColor', colors.light);
      this.doc.roundedRect(pageWidth - 100, yPos, 85, 60, 3, 3, 'F');
      
      this.applyColor('setTextColor', colors.text);
      this.doc.setFontSize(10);
      
      let summaryY = yPos + 10;
      
      // Summary items
      const items = [
        { label: 'Subtotal', value: summary.subtotal, bold: false },
        { label: 'Tax', value: summary.tax, bold: false },
        { label: 'Discount', value: summary.discount, bold: false },
        { label: 'Total', value: summary.total, bold: true }
      ].filter(item => item.value !== undefined);
      
      items.forEach(item => {
        this.doc.setFont('helvetica', item.bold ? 'bold' : 'normal');
        this.doc.setFontSize(item.bold ? 12 : 10);
        
        if (item.bold) {
          this.applyColor('setFillColor', colors.primary);
          this.doc.rect(pageWidth - 100, summaryY - 5, 85, 12, 'F');
          this.applyColor('setTextColor', colors.white);
        } else {
          this.applyColor('setTextColor', colors.text);
        }
        
        this.doc.text(item.label + ':', pageWidth - 95, summaryY);
        const valueWidth = this.doc.getTextWidth(item.value);
        this.doc.text(item.value, pageWidth - 20 - valueWidth, summaryY);
        summaryY += item.bold ? 15 : 10;
      });
    } else {
      // Print theme - simple summary
      this.applyColor('setTextColor', colors.text);
      this.doc.setFontSize(10);
      
      let summaryY = yPos;
      const items = [
        { label: 'Subtotal', value: summary.subtotal },
        { label: 'Tax', value: summary.tax },
        { label: 'Total', value: summary.total, bold: true }
      ].filter(item => item.value !== undefined);
      
      items.forEach(item => {
        this.doc.setFont('helvetica', item.bold ? 'bold' : 'normal');
        this.doc.text(`${item.label}:`, pageWidth - 80, summaryY);
        const valueWidth = this.doc.getTextWidth(item.value);
        this.doc.text(item.value, pageWidth - 15 - valueWidth, summaryY);
        summaryY += 7;
      });
    }
  }

  /**
   * Add notes/terms section
   */
  addNotes(notes: string, yPos?: number): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    
    if (!notes) return yPos;
    
    this.applyColor('setTextColor', colors.textLight);
    this.doc.setFontSize(9);
    this.doc.setFont('helvetica', 'normal');
    
    if (this.theme === 'digital') {
      // Add background
      const lines = this.doc.splitTextToSize(notes, pageWidth - 130);
      const height = lines.length * 5 + 10;
      
      this.applyColor('setFillColor', colors.light);
      this.doc.roundedRect(15, yPos, pageWidth - 130, height, 3, 3, 'F');
      
      this.doc.text('Notes:', 20, yPos + 8);
      this.doc.text(lines, 20, yPos + 15);
    } else {
      this.doc.text('Notes:', 15, yPos);
      const lines = this.doc.splitTextToSize(notes, pageWidth - 130);
      this.doc.text(lines, 15, yPos + 7);
    }
    
    return yPos + 30;
  }

  /**
   * Add footer with branding
   */
  addFooter(): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    const pageHeight = this.doc.internal.pageSize.getHeight();
    
    if (this.theme === 'digital') {
      // Colorful footer
      this.applyColor('setFillColor', colors.primary);
      this.doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
      
      this.applyColor('setTextColor', colors.white);
      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'normal');
      
      // Thank you message
      const thankYou = 'Thank you for your business!';
      const thankYouWidth = this.doc.getTextWidth(thankYou);
      this.doc.text(thankYou, (pageWidth - thankYouWidth) / 2, pageHeight - 12);
      
      // Website
      this.doc.setFont('helvetica', 'bold');
      const websiteWidth = this.doc.getTextWidth(this.companyInfo.website);
      this.doc.text(this.companyInfo.website, (pageWidth - websiteWidth) / 2, pageHeight - 6);
      
      // Social icons placeholder
      this.applyColor('setFillColor', colors.white);
      const iconY = pageHeight - 10;
      const iconSpacing = 15;
      const startX = pageWidth - 60;
      
      // Add small circles as social media placeholders
      for (let i = 0; i < 3; i++) {
        this.doc.circle(startX + (i * iconSpacing), iconY, 3, 'F');
      }
    } else {
      // Print theme - minimal footer
      this.applyColor('setDrawColor', colors.secondary);
      this.doc.setLineWidth(0.2);
      this.doc.line(15, pageHeight - 25, pageWidth - 15, pageHeight - 25);
      
      this.applyColor('setTextColor', colors.textLight);
      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'normal');
      
      const footerText = `${this.companyInfo.name} | ${this.companyInfo.phone} | ${this.companyInfo.email}`;
      const footerWidth = this.doc.getTextWidth(footerText);
      this.doc.text(footerText, (pageWidth - footerWidth) / 2, pageHeight - 18);
    }
  }

  /**
   * Add page numbers
   */
  addPageNumber(): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    const pageHeight = this.doc.internal.pageSize.getHeight();
    const pageNumber = this.doc.internal.getCurrentPageInfo().pageNumber;
    const totalPages = this.doc.internal.getNumberOfPages();
    
    this.applyColor('setTextColor', colors.textLight);
    this.doc.setFontSize(8);
    this.doc.setFont('helvetica', 'normal');
    
    const pageText = `Page ${pageNumber} of ${totalPages}`;
    const pageTextWidth = this.doc.getTextWidth(pageText);
    this.doc.text(pageText, pageWidth - pageTextWidth - 15, pageHeight - 28);
  }

  /**
   * Add watermark
   */
  addWatermark(text: string): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    const pageHeight = this.doc.internal.pageSize.getHeight();
    
    this.doc.saveGraphicsState();
    this.doc.setGState(this.doc.GState({ opacity: 0.1 }));
    this.applyColor('setTextColor', colors.textLight);
    this.doc.setFontSize(60);
    this.doc.setFont('helvetica', 'bold');
    
    // Center and rotate
    this.doc.text(text, pageWidth / 2, pageHeight / 2, {
      align: 'center',
      angle: -45
    });
    
    this.doc.restoreGraphicsState();
  }

  /**
   * Save or preview the PDF
   */
  save(filename) {
    this.addFooter();
    this.doc.save(filename);
  }

  /**
   * Get PDF as blob for preview
   */
  getBlob() {
    this.addFooter();
    return this.doc.output('blob');
  }

  /**
   * Open PDF in new window
   */
  preview() {
    this.addFooter();
    const pdfUrl = this.doc.output('bloburl');
    window.open(pdfUrl, '_blank');
  }
}

export default GlobalPDFGenerator;