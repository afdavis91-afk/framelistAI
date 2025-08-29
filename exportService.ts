import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Takeoff, Project, TakeoffLineItem } from "../types/construction";
import { useConstructionStore } from "../state/constructionStore";
import { PricingComparison } from "../pricing/types";

// Pipeline integration imports
import { enableAuditTrail, loadLedger } from "../pipeline";

export interface ExportOptions {
  format: "json" | "csv" | "summary" | "pricing_comparison" | "excel" | "pdf_report" | "material_list" | "validation_report";
  includeEvidence: boolean;
  includeAssumptions: boolean;
  includeFlags: boolean;
  includePricing?: boolean;
  includeValidation?: boolean;
  includeGeometry?: boolean;
  groupByCategory?: boolean;
  includeWasteCalculations?: boolean;
  includePhotos?: boolean;
}

export class ExportService {
  async exportTakeoff(
    takeoff: Takeoff,
    project: Project,
    options: ExportOptions,
    pricingComparisons?: PricingComparison[]
  ): Promise<void> {
    try {
      let content: string;
      let filename: string;
      let mimeType: string;

      switch (options.format) {
        case "json":
          content = this.generateJSONExport(takeoff, project, options);
          filename = `${this.sanitizeFilename(project.name)}_takeoff_${takeoff.id}.json`;
          mimeType = "application/json";
          break;
        case "csv":
          content = this.generateCSVExport(takeoff, project, options);
          filename = `${this.sanitizeFilename(project.name)}_takeoff_${takeoff.id}.csv`;
          mimeType = "text/csv";
          break;
        case "summary":
          content = this.generateSummaryExport(takeoff, project, options);
          filename = `${this.sanitizeFilename(project.name)}_takeoff_summary_${takeoff.id}.txt`;
          mimeType = "text/plain";
          break;
        case "pricing_comparison":
          content = this.generatePricingComparisonExport(takeoff, project, options, pricingComparisons || []);
          filename = `${this.sanitizeFilename(project.name)}_pricing_comparison_${takeoff.id}.csv`;
          mimeType = "text/csv";
          break;
        case "material_list":
          content = this.generateMaterialListExport(takeoff, project, options);
          filename = `${this.sanitizeFilename(project.name)}_material_list_${takeoff.id}.csv`;
          mimeType = "text/csv";
          break;
        case "validation_report":
          content = this.generateValidationReportExport(takeoff, project, options);
          filename = `${this.sanitizeFilename(project.name)}_validation_report_${takeoff.id}.txt`;
          mimeType = "text/plain";
          break;
        case "excel":
          content = this.generateExcelExport(takeoff, project, options);
          filename = `${this.sanitizeFilename(project.name)}_takeoff_${takeoff.id}.csv`; // Excel format as CSV for compatibility
          mimeType = "text/csv";
          break;
        case "pdf_report":
          content = this.generatePDFReportExport(takeoff, project, options);
          filename = `${this.sanitizeFilename(project.name)}_report_${takeoff.id}.html`; // HTML for PDF-like formatting
          mimeType = "text/html";
          break;
        default:
          throw new Error("Unsupported export format");
      }

      // Write to temporary file
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType,
          dialogTitle: `Export Takeoff - ${project.name}`,
        });
      } else {
        throw new Error("Sharing is not available on this device");
      }

      // Clean up temporary file
      setTimeout(async () => {
        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        } catch (error) {
          console.warn("Failed to clean up temporary file:", error);
        }
      }, 5000);

    } catch (error) {
      console.error("Export error:", error);
      throw new Error(`Failed to export takeoff: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private generateJSONExport(
    takeoff: Takeoff,
    project: Project,
    options: ExportOptions
  ): string {
    const exportData = {
      project: {
        id: project.id,
        name: project.name,
        address: project.address,
        levels: project.levels,
        exportDate: new Date().toISOString(),
      },
      takeoff: {
        id: takeoff.id,
        createdAt: takeoff.createdAt,
        updatedAt: takeoff.updatedAt,
        confidence: takeoff.confidence,
        // wasteRules are stored in construction standards, not in takeoff
         lineItems: takeoff.lineItems.map(item => ({
           ...item,
           evidenceRefs: options.includeEvidence ? item.evidenceRefs : undefined,
           assumptions: options.includeAssumptions ? item.assumptions : undefined,
         })),
         flags: options.includeFlags ? takeoff.flags : undefined,
         decisions: (takeoff as any).decisions || [],
       },

      exportOptions: options,
    };

    return JSON.stringify(exportData, null, 2);
  }

  private generateCSVExport(
    takeoff: Takeoff,
    project: Project,
    options: ExportOptions
  ): string {
    const headers = [
      "Item ID",
      "Quantity",
      "Unit",
      "Material Spec",
      "Grade",
      "Scope",
      "Level",
      "Sheet Ref",
      "Confidence",
    ];

    if (options.includeAssumptions) {
      headers.push("Assumptions");
    }

    if (options.includeEvidence) {
      headers.push("Evidence");
    }

    const rows = [headers.join(",")];

    takeoff.lineItems.forEach(item => {
      const row = [
        this.escapeCSV(item.itemId),
        item.qty.toString(),
        item.uom,
        this.escapeCSV(item.material.spec),
        this.escapeCSV(item.material.grade),
        this.escapeCSV(item.context.scope),
        this.escapeCSV(item.context.level),
        this.escapeCSV(item.context.sheetRef),
        (item.confidence * 100).toFixed(1) + "%",
      ];

      if (options.includeAssumptions) {
        row.push(this.escapeCSV(item.assumptions.join("; ")));
      }

      if (options.includeEvidence) {
        const evidence = item.evidenceRefs
          .map(ref => `${ref.description} (Page ${ref.pageNumber})`)
          .join("; ");
        row.push(this.escapeCSV(evidence));
      }

      rows.push(row.join(","));
    });

    // Add project info header
    const projectInfo = [
      `# Takeoff Export - ${project.name}`,
      `# Address: ${project.address || "Not specified"}`,
      `# Export Date: ${new Date().toLocaleDateString()}`,
      `# Takeoff ID: ${takeoff.id}`,
      `# Overall Confidence: ${(takeoff.confidence * 100).toFixed(1)}%`,
      `# Total Line Items: ${takeoff.lineItems.length}`,
      "",
    ];

    return projectInfo.join("\n") + rows.join("\n");
  }

  private generateSummaryExport(
    takeoff: Takeoff,
    project: Project,
    options: ExportOptions
  ): string {
    const lines = [
      "CONSTRUCTION TAKEOFF SUMMARY",
      "=" .repeat(50),
      "",
      `Project: ${project.name}`,
      `Address: ${project.address || "Not specified"}`,
      `Export Date: ${new Date().toLocaleDateString()}`,
      `Takeoff ID: ${takeoff.id}`,
      `Overall Confidence: ${(takeoff.confidence * 100).toFixed(1)}%`,
      "",
      "SUMMARY BY MATERIAL TYPE",
      "-" .repeat(30),
    ];

    // Group items by material type
    const materialGroups = this.groupLineItemsByMaterial(takeoff.lineItems);
    
    Object.entries(materialGroups).forEach(([materialType, items]) => {
      lines.push(`\n${materialType.toUpperCase()}:`);
      
      const totalQty = items.reduce((sum, item) => {
        // Only sum if same unit of measure
        const firstUom = items[0].uom;
        return item.uom === firstUom ? sum + item.qty : sum;
      }, 0);
      
      const avgConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
      
      lines.push(`  Total Quantity: ${totalQty} ${items[0].uom}`);
      lines.push(`  Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
      lines.push(`  Line Items: ${items.length}`);
    });

    // Add detailed line items
    lines.push("\n\nDETAILED LINE ITEMS");
    lines.push("-" .repeat(30));

    takeoff.lineItems.forEach((item, index) => {
      lines.push(`\n${index + 1}. ${item.itemId}`);
      lines.push(`   Quantity: ${item.qty} ${item.uom}`);
      lines.push(`   Material: ${item.material.spec} ${item.material.grade}`);
      lines.push(`   Location: ${item.context.level} - ${item.context.scope}`);
      lines.push(`   Reference: ${item.context.sheetRef}`);
      lines.push(`   Confidence: ${(item.confidence * 100).toFixed(1)}%`);
      
      if (options.includeAssumptions && item.assumptions.length > 0) {
        lines.push(`   Assumptions: ${item.assumptions.join(", ")}`);
      }
    });

    // Add flags if requested
    if (options.includeFlags && takeoff.flags.length > 0) {
      lines.push("\n\nFLAGS AND ISSUES");
      lines.push("-" .repeat(30));
      
      takeoff.flags.forEach((flag, index) => {
        lines.push(`\n${index + 1}. ${flag.type.replace(/_/g, " ")} (${flag.severity.toUpperCase()})`);
        lines.push(`   ${flag.message}`);
        if (Array.isArray(flag.sheets) && flag.sheets.length > 0) {
          lines.push(`   Sheets: ${flag.sheets.join(", ")}`);
        }
      });
    }

     // Levels captured summary
     const levelCounts = new Map<string, number>();
     takeoff.lineItems.forEach((it) => {
       const lvl = it.context.level || "UNKNOWN";
       levelCounts.set(lvl, (levelCounts.get(lvl) || 0) + 1);
     });
     if (levelCounts.size > 0) {
       lines.push("\n\nLEVELS CAPTURED");
       lines.push("-" .repeat(30));
       Array.from(levelCounts.entries()).forEach(([lvl, count]) => {
         lines.push(`${lvl}: ${count} item(s)`);
       });
     }

     // AI decisions
     const decisions = (takeoff as any).decisions as any[] | undefined;
     if (Array.isArray(decisions) && decisions.length > 0) {
       lines.push("\n\nAI DECISIONS");
       lines.push("-" .repeat(30));
       const byField: Record<string, number> = {};
       decisions.forEach((d) => { byField[d.field] = (byField[d.field] || 0) + 1; });
       Object.entries(byField).forEach(([field, count]) => {
         lines.push(`Field ${field}: ${count} change(s)`);
       });
       const avg = decisions.reduce((s, d) => s + (d.confidence || 0), 0) / decisions.length;
       lines.push(`Average Decision Confidence: ${(avg * 100).toFixed(1)}%`);
     }

     // Add waste factors from construction standards
     const constructionStandards = useConstructionStore.getState().constructionStandards;
     lines.push("\n\nWASTE FACTORS APPLIED");
     lines.push("-" .repeat(30));
     lines.push(`Studs: ${constructionStandards.wasteFactors.studsPct}%`);
     lines.push(`Plates: ${constructionStandards.wasteFactors.platesPct}%`);
     lines.push(`Sheathing: ${constructionStandards.wasteFactors.sheathingPct}%`);
     lines.push(`Blocking: ${constructionStandards.wasteFactors.blockingPct}%`);
     lines.push(`Fasteners: ${constructionStandards.wasteFactors.fastenersPct}%`);

     return lines.join("\n");

  }

  private generatePricingComparisonExport(
    takeoff: Takeoff,
    project: Project,
    _options: ExportOptions,
    pricingComparisons: PricingComparison[]
  ): string {
    const headers = [
      "Item ID",
      "Material Spec",
      "Quantity",
      "Unit",
      "Live Retail Price",
      "Live Retail Supplier",
      "Baseline Price",
      "Price Delta ($)",
      "Price Delta (%)",
      "Recommended Option",
      "Confidence",
      "Availability",
      "Lead Time (days)",
      "Location",
      "CCI Factor"
    ];

    const rows = [headers.join(",")];

    // Add project info header
    const projectInfo = [
      `# Pricing Comparison Export - ${project.name}`,
      `# Address: ${project.address || "Not specified"}`,
      `# Export Date: ${new Date().toLocaleDateString()}`,
      `# Takeoff ID: ${takeoff.id}`,
      `# Total Comparisons: ${pricingComparisons.length}`,
      "",
    ];

    pricingComparisons.forEach(comparison => {
      const row = [
        this.escapeCSV(comparison.lineItemId),
        this.escapeCSV(comparison.materialSpec),
        comparison.quantity.toString(),
        comparison.unit,
        comparison.liveRetail.bestQuote.totalPrice.toFixed(2),
        this.escapeCSV(comparison.liveRetail.bestQuote.supplierName),
        comparison.baseline.cciAdjustedPrice.toFixed(2),
        comparison.delta.absolute.toFixed(2),
        comparison.delta.percentage.toFixed(1) + "%",
        comparison.recommendation.preferredOption.replace("_", " "),
        (comparison.overallConfidence * 100).toFixed(1) + "%",
        comparison.liveRetail.marketAvailability.replace("_", " "),
        comparison.liveRetail.bestQuote.leadTime.toString(),
        `${comparison.location.city}, ${comparison.location.state}`,
        comparison.location.costIndex.toFixed(2)
      ];

      rows.push(row.join(","));
    });

    // Add summary statistics
    if (pricingComparisons.length > 0) {
      const totalLiveRetail = pricingComparisons.reduce((sum, c) => sum + c.liveRetail.bestQuote.totalPrice, 0);
      const totalBaseline = pricingComparisons.reduce((sum, c) => sum + c.baseline.cciAdjustedPrice, 0);
      const avgConfidence = pricingComparisons.reduce((sum, c) => sum + c.overallConfidence, 0) / pricingComparisons.length;
      
      const summaryRows = [
        "",
        "# SUMMARY STATISTICS",
        `# Total Live Retail: $${totalLiveRetail.toFixed(2)}`,
        `# Total Baseline: $${totalBaseline.toFixed(2)}`,
        `# Potential Savings: $${Math.abs(totalBaseline - totalLiveRetail).toFixed(2)}`,
        `# Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`,
        `# Items Analyzed: ${pricingComparisons.length}`,
      ];
      
      rows.push(...summaryRows);
    }

    return projectInfo.join("\n") + rows.join("\n");
  }

  private generateMaterialListExport(
    takeoff: Takeoff,
    project: Project,
    options: ExportOptions
  ): string {
    const headers = [
      "Category",
      "Material Description",
      "Size/Specification",
      "Grade",
      "Species",
      "Treatment",
      "Quantity",
      "Unit",
      "Waste %",
      "Total with Waste",
      "Notes"
    ];

    const rows = [headers.join(",")];

    // Group items by category
    const categorizedItems = this.groupItemsByCategory(takeoff.lineItems);

    Object.entries(categorizedItems).forEach(([category, items]) => {
      // Add category header
      rows.push(`\n# ${category.toUpperCase()}`);
      
      items.forEach(item => {
        const wastePercent = item.waste?.wastePercentage || 0;
        const totalWithWaste = item.qty * (1 + wastePercent / 100);
        
        const row = [
          this.escapeCSV(category),
          this.escapeCSV(item.material.spec),
          this.escapeCSV(item.material.size || ""),
          this.escapeCSV(item.material.grade || ""),
          this.escapeCSV(item.material.species || ""),
          this.escapeCSV(item.material.treatment || ""),
          item.qty.toString(),
          item.uom,
          wastePercent.toString() + "%",
          totalWithWaste.toFixed(2),
          this.escapeCSV(item.assumptions.join("; "))
        ];
        
        rows.push(row.join(","));
      });
    });

    // Add project header
    const projectInfo = [
      `# Material List - ${project.name}`,
      `# Address: ${project.address || "Not specified"}`,
      `# Export Date: ${new Date().toLocaleDateString()}`,
      `# Takeoff ID: ${takeoff.id}`,
      `# Total Items: ${takeoff.lineItems.length}`,
      "",
    ];

    return projectInfo.join("\n") + rows.join("\n");
  }

  private generateValidationReportExport(
    takeoff: Takeoff,
    project: Project,
    options: ExportOptions
  ): string {
    const lines = [
      "MATERIAL VALIDATION REPORT",
      "=" .repeat(50),
      "",
      `Project: ${project.name}`,
      `Address: ${project.address || "Not specified"}`,
      `Export Date: ${new Date().toLocaleDateString()}`,
      `Takeoff ID: ${takeoff.id}`,
      "",
    ];

    // Validation summary
    const validationFlags = takeoff.flags.filter(f => 
      f.type === "SPEC_UNCLEAR" || f.type === "LOW_CONFIDENCE" || f.type === "CONFLICT"
    );
    
    const criticalIssues = validationFlags.filter(f => f.severity === "critical").length;
    const highIssues = validationFlags.filter(f => f.severity === "high").length;
    const mediumIssues = validationFlags.filter(f => f.severity === "medium").length;
    const lowIssues = validationFlags.filter(f => f.severity === "low").length;

    lines.push("VALIDATION SUMMARY");
    lines.push("-" .repeat(30));
    lines.push(`Total Items Validated: ${takeoff.lineItems.length}`);
    lines.push(`Critical Issues: ${criticalIssues}`);
    lines.push(`High Priority Issues: ${highIssues}`);
    lines.push(`Medium Priority Issues: ${mediumIssues}`);
    lines.push(`Low Priority Issues: ${lowIssues}`);
    lines.push(`Overall Confidence: ${(takeoff.confidence * 100).toFixed(1)}%`);
    lines.push("");

    // Confidence distribution
    const highConfidence = takeoff.lineItems.filter(i => i.confidence >= 0.8).length;
    const mediumConfidence = takeoff.lineItems.filter(i => i.confidence >= 0.6 && i.confidence < 0.8).length;
    const lowConfidence = takeoff.lineItems.filter(i => i.confidence < 0.6).length;

    lines.push("CONFIDENCE DISTRIBUTION");
    lines.push("-" .repeat(30));
    lines.push(`High Confidence (≥80%): ${highConfidence} items`);
    lines.push(`Medium Confidence (60-79%): ${mediumConfidence} items`);
    lines.push(`Low Confidence (<60%): ${lowConfidence} items`);
    lines.push("");

    // Detailed validation issues
    if (validationFlags.length > 0) {
      lines.push("VALIDATION ISSUES");
      lines.push("-" .repeat(30));
      
      validationFlags.forEach((flag, index) => {
        lines.push(`\n${index + 1}. ${flag.type.replace(/_/g, " ")} (${flag.severity.toUpperCase()})`);
        lines.push(`   Message: ${flag.message}`);
        if (flag.sheets.length > 0) {
          lines.push(`   Affected Sheets: ${flag.sheets.join(", ")}`);
        }
        lines.push(`   Status: ${flag.resolved ? "Resolved" : "Unresolved"}`);
      });
    }

    // Items requiring attention
    const lowConfidenceItems = takeoff.lineItems.filter(i => i.confidence < 0.6);
    if (lowConfidenceItems.length > 0) {
      lines.push("\n\nITEMS REQUIRING ATTENTION");
      lines.push("-" .repeat(30));
      
      lowConfidenceItems.forEach((item, index) => {
        lines.push(`\n${index + 1}. ${item.itemId}`);
        lines.push(`   Material: ${item.material.spec} ${item.material.grade || ""}`);
        lines.push(`   Confidence: ${(item.confidence * 100).toFixed(1)}%`);
        lines.push(`   Location: ${item.context.level} - ${item.context.scope}`);
        if (item.assumptions.length > 0) {
          lines.push(`   Assumptions: ${item.assumptions.join(", ")}`);
        }
      });
    }

    return lines.join("\n");
  }

  private generateExcelExport(
    takeoff: Takeoff,
    project: Project,
    options: ExportOptions
  ): string {
    // Enhanced CSV format suitable for Excel import
    const sheets = [];
    
    // Summary sheet
    const summaryHeaders = ["Metric", "Value"];
    const summaryRows = [
      summaryHeaders.join(","),
      `"Project Name","${this.escapeCSV(project.name)}"`,
      `"Address","${this.escapeCSV(project.address || "Not specified")}"`,
      `"Export Date","${new Date().toLocaleDateString()}"`,
      `"Takeoff ID","${takeoff.id}"`,
      `"Total Line Items","${takeoff.lineItems.length}"`,
      `"Overall Confidence","${(takeoff.confidence * 100).toFixed(1)}%"`,
      `"Total Flags","${takeoff.flags.length}"`,
    ];
    
    sheets.push("# SUMMARY SHEET");
    sheets.push(summaryRows.join("\n"));
    sheets.push("");

    // Materials sheet (enhanced CSV)
    const materialHeaders = [
      "Item ID", "Category", "Material Spec", "Size", "Grade", "Species", 
      "Treatment", "Quantity", "Unit", "Waste %", "Total with Waste",
      "Confidence %", "Level", "Scope", "Sheet Ref", "Assumptions"
    ];
    
    sheets.push("# MATERIALS SHEET");
    sheets.push(materialHeaders.join(","));
    
    const categorizedItems = this.groupItemsByCategory(takeoff.lineItems);
    Object.entries(categorizedItems).forEach(([category, items]) => {
      items.forEach(item => {
        const wastePercent = item.waste?.wastePercentage || 0;
        const totalWithWaste = item.qty * (1 + wastePercent / 100);
        
        const row = [
          this.escapeCSV(item.itemId),
          this.escapeCSV(category),
          this.escapeCSV(item.material.spec),
          this.escapeCSV(item.material.size || ""),
          this.escapeCSV(item.material.grade || ""),
          this.escapeCSV(item.material.species || ""),
          this.escapeCSV(item.material.treatment || ""),
          item.qty.toString(),
          item.uom,
          wastePercent.toString(),
          totalWithWaste.toFixed(2),
          (item.confidence * 100).toFixed(1),
          this.escapeCSV(item.context.level),
          this.escapeCSV(item.context.scope),
          this.escapeCSV(item.context.sheetRef),
          this.escapeCSV(item.assumptions.join("; "))
        ];
        
        sheets.push(row.join(","));
      });
    });

    // Flags sheet
    if (options.includeFlags && takeoff.flags.length > 0) {
      sheets.push("\n# FLAGS SHEET");
      const flagHeaders = ["Type", "Severity", "Message", "Sheets", "Resolved"];
      sheets.push(flagHeaders.join(","));
      
      takeoff.flags.forEach(flag => {
        const row = [
          this.escapeCSV(flag.type.replace(/_/g, " ")),
          flag.severity,
          this.escapeCSV(flag.message),
          this.escapeCSV(flag.sheets.join("; ")),
          flag.resolved ? "Yes" : "No"
        ];
        sheets.push(row.join(","));
      });
    }

    return sheets.join("\n");
  }

  private generatePDFReportExport(
    takeoff: Takeoff,
    project: Project,
    options: ExportOptions
  ): string {
    // Generate HTML that can be converted to PDF
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Construction Takeoff Report - ${project.name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .project-info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
        .summary-card { background: white; border: 1px solid #ddd; padding: 15px; border-radius: 5px; text-align: center; }
        .summary-card h3 { margin: 0 0 10px 0; color: #333; }
        .summary-card .value { font-size: 24px; font-weight: bold; color: #007AFF; }
        .category-section { margin-bottom: 30px; }
        .category-header { background: #007AFF; color: white; padding: 10px; margin-bottom: 10px; }
        .item-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .item-table th, .item-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .item-table th { background: #f5f5f5; font-weight: bold; }
        .confidence-high { color: #10B981; font-weight: bold; }
        .confidence-medium { color: #F59E0B; font-weight: bold; }
        .confidence-low { color: #EF4444; font-weight: bold; }
        .flags-section { background: #FEF2F2; border: 1px solid #FECACA; padding: 15px; border-radius: 5px; }
        .flag-item { margin-bottom: 10px; padding: 10px; border-left: 4px solid #EF4444; background: white; }
        @media print { body { margin: 0; } .no-print { display: none; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>Construction Takeoff Report</h1>
        <h2>${project.name}</h2>
        <p>${project.address || "Address not specified"}</p>
        <p>Generated on ${new Date().toLocaleDateString()}</p>
    </div>

    <div class="project-info">
        <h3>Project Information</h3>
        <p><strong>Takeoff ID:</strong> ${takeoff.id}</p>
        <p><strong>Created:</strong> ${new Date(takeoff.createdAt).toLocaleDateString()}</p>
        <p><strong>Last Updated:</strong> ${new Date(takeoff.updatedAt).toLocaleDateString()}</p>
        <p><strong>Project Levels:</strong> ${project.levels.join(", ") || "Not specified"}</p>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <h3>Total Items</h3>
            <div class="value">${takeoff.lineItems.length}</div>
        </div>
        <div class="summary-card">
            <h3>Overall Confidence</h3>
            <div class="value">${(takeoff.confidence * 100).toFixed(1)}%</div>
        </div>
        <div class="summary-card">
            <h3>Flags</h3>
            <div class="value">${takeoff.flags.length}</div>
        </div>
        <div class="summary-card">
            <h3>Categories</h3>
            <div class="value">${Object.keys(this.groupItemsByCategory(takeoff.lineItems)).length}</div>
        </div>
    </div>

    ${this.generateCategoryTablesHTML(takeoff.lineItems)}

    ${options.includeFlags && takeoff.flags.length > 0 ? this.generateFlagsHTML(takeoff.flags) : ""}

    <div style="margin-top: 40px; text-align: center; color: #666; font-size: 12px;">
        <p>This report was generated by Construction Takeoff AI</p>
        <p>Export Date: ${new Date().toISOString()}</p>
    </div>
</body>
</html>`;

    return html;
  }

  private generateCategoryTablesHTML(lineItems: TakeoffLineItem[]): string {
    const categorizedItems = this.groupItemsByCategory(lineItems);
    let html = "";

    Object.entries(categorizedItems).forEach(([category, items]) => {
      const totalQuantity = items.reduce((sum, item) => {
        // Only sum items with the same UOM
        const firstUom = items[0].uom;
        return item.uom === firstUom ? sum + item.qty : sum;
      }, 0);

      const avgConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;

      html += `
        <div class="category-section">
            <div class="category-header">
                <h3>${category.toUpperCase()} (${items.length} items)</h3>
            </div>
            <table class="item-table">
                <thead>
                    <tr>
                        <th>Material Specification</th>
                        <th>Size/Grade</th>
                        <th>Quantity</th>
                        <th>Unit</th>
                        <th>Confidence</th>
                        <th>Location</th>
                    </tr>
                </thead>
                <tbody>`;

      items.forEach(item => {
        const confidenceClass = item.confidence >= 0.8 ? "confidence-high" : 
                              item.confidence >= 0.6 ? "confidence-medium" : "confidence-low";
        
        html += `
                    <tr>
                        <td>${item.material.spec}</td>
                        <td>${item.material.size || ""} ${item.material.grade || ""}</td>
                        <td>${item.qty.toLocaleString()}</td>
                        <td>${item.uom}</td>
                        <td class="${confidenceClass}">${(item.confidence * 100).toFixed(1)}%</td>
                        <td>${item.context.level} - ${item.context.scope}</td>
                    </tr>`;
      });

      html += `
                </tbody>
            </table>
        </div>`;
    });

    return html;
  }

  private generateFlagsHTML(flags: any[]): string {
    return `
        <div class="flags-section">
            <h3>Flags and Issues</h3>
            ${flags.map((flag, index) => `
                <div class="flag-item">
                    <strong>${flag.type.replace(/_/g, " ")} (${flag.severity.toUpperCase()})</strong><br>
                    ${flag.message}<br>
                    ${Array.isArray(flag.sheets) && flag.sheets.length > 0 ? `<small>Sheets: ${flag.sheets.join(", ")}</small>` : ""}
                </div>
            `).join("")}
        </div>`;
  }

  private groupItemsByCategory(lineItems: TakeoffLineItem[]): Record<string, TakeoffLineItem[]> {
    const categories: Record<string, TakeoffLineItem[]> = {};
    
    lineItems.forEach(item => {
      const category = this.getCategoryFromScope(item.context.scope);
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(item);
    });
    
    return categories;
  }

  private getCategoryFromScope(scope: string): string {
    const lowerScope = scope.toLowerCase();
    
    if (lowerScope.includes("joist")) return "Joists";
    if (lowerScope.includes("rafter")) return "Rafters";
    if (lowerScope.includes("beam") || lowerScope.includes("header")) return "Beams/Headers";
    if (lowerScope.includes("stud")) return "Studs";
    if (lowerScope.includes("plate")) return "Plates";
    if (lowerScope.includes("blocking")) return "Blocking";
    if (lowerScope.includes("sheathing")) return "Sheathing";
    if (lowerScope.includes("hanger") || lowerScope.includes("connector")) return "Connectors";
    if (lowerScope.includes("fastener")) return "Fasteners";
    if (lowerScope.includes("wall")) return "Walls";
    if (lowerScope.includes("opening")) return "Openings";
    
    return "Other";
  }

  private groupLineItemsByMaterial(lineItems: TakeoffLineItem[]): Record<string, TakeoffLineItem[]> {
    const groups: Record<string, TakeoffLineItem[]> = {};
    
    lineItems.forEach(item => {
      const materialType = this.getMaterialType(item.itemId);
      if (!groups[materialType]) {
        groups[materialType] = [];
      }
      groups[materialType].push(item);
    });
    
    return groups;
  }

  private getMaterialType(itemId: string): string {
    const id = itemId.toLowerCase();
    if (id.includes("stud")) return "studs";
    if (id.includes("plate")) return "plates";
    if (id.includes("sheath")) return "sheathing";
    if (id.includes("header")) return "headers";
    if (id.includes("block")) return "blocking";
    if (id.includes("nail") || id.includes("screw") || id.includes("fastener")) return "fasteners";
    if (id.includes("connector") || id.includes("strap") || id.includes("anchor")) return "connectors";
    return "other";
  }

  private escapeCSV(value: string): string {
    if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9\-_\s]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 50);
  }

  async exportMultipleTakeoffs(
    takeoffs: Takeoff[],
    project: Project,
    options: ExportOptions
  ): Promise<void> {
    if (takeoffs.length === 0) {
      throw new Error("No takeoffs to export");
    }

    if (takeoffs.length === 1) {
      return this.exportTakeoff(takeoffs[0], project, options);
    }

    // For multiple takeoffs, create a combined export
    const combinedData = {
      project: {
        id: project.id,
        name: project.name,
        address: project.address,
        levels: project.levels,
        exportDate: new Date().toISOString(),
      },
      takeoffs: takeoffs.map(takeoff => ({
        id: takeoff.id,
        createdAt: takeoff.createdAt,
        confidence: takeoff.confidence,
        lineItemCount: takeoff.lineItems.length,
        flagCount: takeoff.flags.length,
        lineItems: options.format === "json" ? takeoff.lineItems : undefined,
        flags: options.format === "json" && options.includeFlags ? takeoff.flags : undefined,
      })),
      summary: {
        totalTakeoffs: takeoffs.length,
        totalLineItems: takeoffs.reduce((sum, t) => sum + t.lineItems.length, 0),
        totalFlags: takeoffs.reduce((sum, t) => sum + t.flags.length, 0),
        averageConfidence: takeoffs.reduce((sum, t) => sum + t.confidence, 0) / takeoffs.length,
      },
    };

    const content = JSON.stringify(combinedData, null, 2);
    const filename = `${this.sanitizeFilename(project.name)}_multiple_takeoffs.json`;
    
    const fileUri = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: "application/json",
        dialogTitle: `Export Multiple Takeoffs - ${project.name}`,
      });
    }

    // Clean up
    setTimeout(async () => {
      try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch (error) {
        console.warn("Failed to clean up temporary file:", error);
      }
    }, 5000);
  }

  /**
   * Export ledger JSON for audit trail
   */
  async exportLedgerJSON(docId: string, runId: string): Promise<string | null> {
    if (!enableAuditTrail()) {
      console.log("Audit trail export disabled");
      return null;
    }

    try {
      const ledger = await loadLedger(docId, runId);
      if (!ledger) {
        console.log(`No ledger found for docId: ${docId}, runId: ${runId}`);
        return null;
      }

      const ledgerJson = ledger.toJSON();
      const filename = `ledger_${docId}_${runId}.json`;
      
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(ledgerJson, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/json",
          dialogTitle: `Export Ledger - ${docId}`,
        });
      }

      // Clean up
      setTimeout(async () => {
        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        } catch (error) {
          console.warn("Failed to clean up temporary file:", error);
        }
      }, 5000);

      return fileUri;
    } catch (error) {
      console.error("Failed to export ledger:", error);
      return null;
    }
  }
}

export const exportService = new ExportService();