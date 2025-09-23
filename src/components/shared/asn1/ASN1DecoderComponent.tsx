"use client";

import { useState, useRef, ChangeEvent, useCallback } from 'react';
import { useASN1Decoder } from './useASN1Decoder';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, FileText, Download, Copy, AlertCircle, ChevronRight, ChevronDown } from 'lucide-react';

interface FileInfo {
  name: string;
  size: number;
  type: string;
}

interface ASN1TreeNode {
  id: string;
  line: string;
  indentLevel: number;
  children: ASN1TreeNode[];
  hasChildren: boolean;
  type?: string;
  byteStart?: number;
  byteEnd?: number;
}

interface TreeNodeProps {
  node: ASN1TreeNode;
  expandedNodes: Set<string>;
  onToggle: (nodeId: string) => void;
  onHover: (byteRange: { start: number; end: number } | null) => void;
  mergedView: boolean;
}

const ASN1DecoderComponent: React.FC = () => {
  const {
    isLoading,
    error,
    decodedData,
    definitions,
    selectedDefinition,
    wantHex,
    trimHex,
    wantDef,
    setWantHex,
    setTrimHex,
    setWantDef,
    setSelectedDefinition,
    decodeText,
    decodeFile,
  } = useASN1Decoder();

  const [textAreaValue, setTextAreaValue] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [showColorLegend, setShowColorLegend] = useState<boolean>(true);
  const [colorsEnabled, setColorsEnabled] = useState<boolean>(true);
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
  const [mergedView, setMergedView] = useState<boolean>(false);
  const [derDecoderView, setDerDecoderView] = useState<boolean>(false);
  const [hoveredByteRange, setHoveredByteRange] = useState<{ start: number; end: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile({
        name: file.name,
        size: file.size,
        type: file.type
      });
    }
  };

  // Handle file decode
  const handleDecodeFile = async (): Promise<void> => {
    if (!fileInputRef.current?.files?.[0]) return;
    
    const file = fileInputRef.current.files[0];
    try {
      await decodeFile(file);
    } catch (err) {
      console.error('Error decoding file:', err);
    }
  };

  // Handle textarea decode
  const handleDecodeText = async (): Promise<void> => {
    if (!textAreaValue.trim()) return;
    
    try {
      await decodeText(textAreaValue);
    } catch (err) {
      console.error('Error decoding text:', err);
    }
  };

  // Handle option changes
  const changeWantHex = (checked: boolean): void => {
    setWantHex(checked);
  };

  const changeTrimHex = (checked: boolean): void => {
    setTrimHex(checked);
  };

  const changeWantDef = (checked: boolean): void => {
    setWantDef(checked);
  };

  const changeDefinition = (value: string): void => {
    setSelectedDefinition(value);
  };

  // Toggle node expansion
  const toggleNode = useCallback((nodeId: string): void => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  // Handle node hover for hex highlighting
  const handleNodeHover = useCallback((byteRange: { start: number; end: number } | null): void => {
    setHoveredByteRange(byteRange);
  }, []);

  // Expand all nodes
  const expandAll = useCallback((nodes: ASN1TreeNode[]): void => {
    const getAllNodeIds = (nodeList: ASN1TreeNode[]): string[] => {
      let ids: string[] = [];
      nodeList.forEach(node => {
        if (node.hasChildren) {
          ids.push(node.id);
          ids = ids.concat(getAllNodeIds(node.children));
        }
      });
      return ids;
    };

    const allIds = getAllNodeIds(nodes);
    setExpandedNodes(new Set(allIds));
  }, []);

  // Collapse all nodes
  const collapseAll = useCallback((): void => {
    setExpandedNodes(new Set());
  }, []);

  // Helper function to decompose tag byte into its components
  const decomposeTagByte = (hexValue: string): {
    binary: string;
    class: string;
    constructed: boolean;
    tagNumber: number;
    classColor: string;
    constructedColor: string;
    tagColor: string;
  } => {
    const decimal = parseInt(hexValue, 16);
    const binary = decimal.toString(2).padStart(8, '0');
    
    // Extract components
    const classBits = (decimal >> 6) & 0x03; // bits 7-6
    const constructedBit = (decimal >> 5) & 0x01; // bit 5
    const tagBits = decimal & 0x1F; // bits 4-0
    
    const classNames = ['Universal', 'Application', 'Context', 'Private'];
    const className = classNames[classBits];
    
    return {
      binary,
      class: className,
      constructed: constructedBit === 1,
      tagNumber: tagBits,
      classColor: classBits === 0 ? 'text-green-600 dark:text-green-400' : 
                  classBits === 1 ? 'text-blue-600 dark:text-blue-400' :
                  classBits === 2 ? 'text-purple-600 dark:text-purple-400' : 'text-red-600 dark:text-red-400',
      constructedColor: constructedBit === 1 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400',
      tagColor: 'text-indigo-600 dark:text-indigo-400'
    };
  };

  // Shared Color Legend Component
  const ColorLegend: React.FC = () => {
    if (!showColorLegend) return null;

    // Helper function to render tag entry
    const renderTagEntry = (hexValue: string, name: string, colorClass: string) => {
      if (advancedMode) {
        const decomposed = decomposeTagByte(hexValue);
        return (
          <div key={hexValue} className={`p-2 rounded border ${colorClass} bg-opacity-10`}>
            <div className="font-semibold mb-1">{hexValue} {name}</div>
            <div className="font-mono text-xs space-y-1">
              <div>Binary: <span className="font-bold">{decomposed.binary}</span></div>
              <div className="grid grid-cols-3 gap-2">
                <div className={decomposed.classColor}>
                  Class: {decomposed.class}
                </div>
                <div className={decomposed.constructedColor}>
                  {decomposed.constructed ? 'Constructed' : 'Primitive'}
                </div>
                <div className={decomposed.tagColor}>
                  Tag: {decomposed.tagNumber}
                </div>
              </div>
            </div>
          </div>
        );
      } else {
        return (
          <span key={hexValue} className={`inline-flex items-center px-1 rounded ${colorClass} font-semibold`}>
            {hexValue} {name}
          </span>
        );
      }
    };

    return (
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">ASN.1 Color Legend</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="colors-enabled" 
                    checked={colorsEnabled} 
                    onCheckedChange={(checked) => setColorsEnabled(checked === true)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="colors-enabled" className="text-xs text-blue-800 dark:text-blue-200">
                    Enable colors
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="advanced-mode" 
                    checked={advancedMode} 
                    onCheckedChange={(checked) => setAdvancedMode(checked === true)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="advanced-mode" className="text-xs text-blue-800 dark:text-blue-200">
                    Advanced mode
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="merged-view" 
                    checked={mergedView} 
                    onCheckedChange={(checked) => setMergedView(checked === true)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="merged-view" className="text-xs text-blue-800 dark:text-blue-200">
                    Merged view
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="der-decoder-view" 
                    checked={derDecoderView} 
                    onCheckedChange={(checked) => setDerDecoderView(checked === true)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="der-decoder-view" className="text-xs text-blue-800 dark:text-blue-200">
                    DER decoder
                  </Label>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowColorLegend(false)}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              <ChevronRight className="w-4 h-4" />
              Hide Legend
            </Button>
          </div>
        
        <div className="space-y-2 text-xs">
          {advancedMode && (
            <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="font-medium text-blue-900 dark:text-blue-100 mb-2">Bit Decomposition Legend:</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-200 dark:bg-green-800 rounded"></div>
                  <span>Class (bits 7-6)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-200 dark:bg-orange-800 rounded"></div>
                  <span>Constructed (bit 5)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-indigo-200 dark:bg-indigo-800 rounded"></div>
                  <span>Tag Number (bits 4-0)</span>
                </div>
              </div>
            </div>
          )}

          {/* Structural Types */}
          <div>
            <div className="font-medium text-blue-900 dark:text-blue-100 mb-1">Structural Types:</div>
            <div className={advancedMode ? "space-y-2" : "flex flex-wrap gap-1"}>
              {renderTagEntry("30", "SEQUENCE", "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950")}
              {renderTagEntry("31", "SET", "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950")}
            </div>
          </div>
          
          {/* Primitive Data Types */}
          <div>
            <div className="font-medium text-blue-900 dark:text-blue-100 mb-1">Data Types:</div>
            <div className={advancedMode ? "space-y-2" : "flex flex-wrap gap-1"}>
              {renderTagEntry("02", "INTEGER", "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950")}
              {renderTagEntry("03", "BIT STRING", "text-orange-500 dark:text-orange-300 bg-orange-50 dark:bg-orange-950")}
              {renderTagEntry("04", "OCTET STRING", "text-orange-700 dark:text-orange-500 bg-orange-50 dark:bg-orange-950")}
              {renderTagEntry("06", "OID", "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950")}
              {renderTagEntry("0A", "ENUMERATED", "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950")}
            </div>
          </div>
          
          {/* String Types */}
          <div>
            <div className="font-medium text-blue-900 dark:text-blue-100 mb-1">String Types:</div>
            <div className={advancedMode ? "space-y-2" : "flex flex-wrap gap-1"}>
              {renderTagEntry("0C", "UTF8String", "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950")}
              {renderTagEntry("13", "PrintableString", "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950")}
              {renderTagEntry("16", "IA5String", "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950")}
            </div>
          </div>
          
          {/* Time and Simple Types */}
          <div className={advancedMode ? "space-y-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
            <div>
              <div className="font-medium text-blue-900 dark:text-blue-100 mb-1">Time Types:</div>
              <div className={advancedMode ? "space-y-2" : "flex flex-wrap gap-1"}>
                {renderTagEntry("17", "UTCTime", "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950")}
                {renderTagEntry("18", "GeneralizedTime", "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950")}
              </div>
            </div>
            
            <div>
              <div className="font-medium text-blue-900 dark:text-blue-100 mb-1">Simple Types:</div>
              <div className={advancedMode ? "space-y-2" : "flex flex-wrap gap-1"}>
                {renderTagEntry("01", "BOOLEAN", "text-red-500 dark:text-red-300 bg-red-50 dark:bg-red-950")}
                {renderTagEntry("05", "NULL", "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950")}
              </div>
            </div>
          </div>
          
          <div className="text-xs text-blue-700 dark:text-blue-300 italic pt-1">
            💡 Hover over any hex byte for detailed information • Colors can be disabled above
          </div>
        </div>
        </CardContent>
      </Card>
    );
  };

  // Parse ASN.1 structure into a tree
  const parseASN1Tree = useCallback((structure: string): ASN1TreeNode[] => {
    const lines = structure.split('\n').filter(line => line.trim());
    const nodes: ASN1TreeNode[] = [];
    const stack: { node: ASN1TreeNode; level: number }[] = [];

    lines.forEach((line, index) => {
      const indentLevel = (line.match(/^\s*/)?.[0].length || 0) / 2;
      const trimmedLine = line.trim();
      
      // Extract ASN.1 type if present
      const typeMatch = trimmedLine.match(/(SEQUENCE|SET|OBJECT IDENTIFIER|INTEGER|BIT STRING|OCTET STRING|UTF8String|PrintableString|UTCTime|GeneralizedTime|NULL|BOOLEAN|ENUMERATED)/);
      const type = typeMatch ? typeMatch[1] : undefined;
      
      // Extract byte positions from the ASN.1 structure line
      // Format: "[+001C]" or similar hex offset indicators
      const bytePositionMatch = trimmedLine.match(/\[\+([0-9A-Fa-f]+)\]/);
      let byteStart: number | undefined;
      let byteEnd: number | undefined;
      
      if (bytePositionMatch) {
        byteStart = parseInt(bytePositionMatch[1], 16);
        
        // Try to extract length info to calculate byte end
        // Look for length patterns like "l=XX" or similar
        const lengthMatch = trimmedLine.match(/l=(\d+)/);
        if (lengthMatch) {
          const contentLength = parseInt(lengthMatch[1], 10);
          // Add tag byte (1) + length encoding bytes (usually 1-4) + content length
          // This is an approximation - actual calculation would need full ASN.1 parsing
          byteEnd = byteStart + 1 + (contentLength > 127 ? Math.ceil(Math.log2(contentLength) / 8) + 1 : 1) + contentLength;
        } else {
          // Default to a small range if we can't determine length
          byteEnd = byteStart + 2;
        }
      }
      
      const node: ASN1TreeNode = {
        id: `node-${index}`,
        line: trimmedLine,
        indentLevel,
        children: [],
        hasChildren: false,
        type,
        byteStart,
        byteEnd
      };

      // Determine if this node has children by looking ahead
      const nextLineIndex = index + 1;
      if (nextLineIndex < lines.length) {
        const nextLine = lines[nextLineIndex];
        const nextIndentLevel = (nextLine.match(/^\s*/)?.[0].length || 0) / 2;
        node.hasChildren = nextIndentLevel > indentLevel;
      }

      // Find the correct parent in the stack
      while (stack.length > 0 && stack[stack.length - 1].level >= indentLevel) {
        stack.pop();
      }

      if (stack.length === 0) {
        // Root level node
        nodes.push(node);
      } else {
        // Child node
        const parent = stack[stack.length - 1].node;
        parent.children.push(node);
        parent.hasChildren = true;
      }

      // Add to stack if it could be a parent
      stack.push({ node, level: indentLevel });
    });

    return nodes;
  }, []);

  // Function to extract hex values from ASN.1 line
  const extractHexFromLine = (line: string): string => {
    // Match patterns like:
    // SEQUENCE @0+140 -> should show tag+length bytes only (e.g., "30 81 8e")
    // INTEGER @20+1 01 -> should show "02 01 01"
    // OCTET STRING @23+32 30 1e 80 1c 00... -> should show the actual bytes
    
    // For lines with explicit hex bytes after the type declaration
    const hexMatch = line.match(/\s+([a-fA-F0-9\s]+)$/);
    if (hexMatch) {
      return hexMatch[1].trim();
    }
    
    // For structural elements (SEQUENCE, SET), extract tag and length encoding
    // Pattern: TYPE @offset+length
    const structuralMatch = line.match(/^(\s*)(SEQUENCE|SET|OBJECT IDENTIFIER|INTEGER|BIT STRING|OCTET STRING|UTF8String|PrintableString|UTCTime|GeneralizedTime|NULL|BOOLEAN|ENUMERATED|\[[0-9]+\])\s+@(\d+)\+(\d+)/);
    if (structuralMatch) {
      const type = structuralMatch[2];
      const length = parseInt(structuralMatch[4]);
      
      // Get the appropriate tag byte for the type
      const getTagByte = (type: string): string => {
        switch (type) {
          case 'SEQUENCE': return '30';
          case 'SET': return '31';
          case 'INTEGER': return '02';
          case 'BIT STRING': return '03';
          case 'OCTET STRING': return '04';
          case 'NULL': return '05';
          case 'OBJECT IDENTIFIER': return '06';
          case 'UTF8String': return '0c';
          case 'PrintableString': return '13';
          case 'UTCTime': return '17';
          case 'GeneralizedTime': return '18';
          case 'ENUMERATED': return '0a';
          case 'BOOLEAN': return '01';
          default:
            // Context-specific tags [0], [1], etc.
            const contextMatch = type.match(/\[(\d+)\]/);
            if (contextMatch) {
              const tagNum = parseInt(contextMatch[1]);
              return (0x80 + tagNum).toString(16).padStart(2, '0');
            }
            return '??';
        }
      };
      
      // Get length encoding
      const getLengthBytes = (length: number): string => {
        if (length < 0x80) {
          // Short form
          return length.toString(16).padStart(2, '0');
        } else if (length < 0x100) {
          // Long form, 1 byte
          return `81 ${length.toString(16).padStart(2, '0')}`;
        } else if (length < 0x10000) {
          // Long form, 2 bytes
          return `82 ${Math.floor(length / 256).toString(16).padStart(2, '0')} ${(length % 256).toString(16).padStart(2, '0')}`;
        } else {
          // Long form, 3+ bytes (simplified)
          return `83 ${Math.floor(length / 65536).toString(16).padStart(2, '0')} ${Math.floor((length % 65536) / 256).toString(16).padStart(2, '0')} ${(length % 256).toString(16).padStart(2, '0')}`;
        }
      };
      
      const tagByte = getTagByte(type);
      const lengthBytes = getLengthBytes(length);
      
      return `${tagByte} ${lengthBytes}`;
    }
    
    return '';
  };

  // Function to convert ASN.1 structure to DER decoder format
  const convertToDerDecoderFormat = (structure: string): string => {
    const lines = structure.split('\n').filter(line => line.trim());
    const result: string[] = [];
    const braceStack: number[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const originalLine = lines[i];
      const line = originalLine.trim();
      if (!line) continue;
      
      // Calculate indentation based on the original indentation
      const originalIndent = originalLine.length - originalLine.trimStart().length;
      const indent = '   '.repeat(Math.floor(originalIndent / 4));
      
      // Parse different ASN.1 types
      if (line.includes('SEQUENCE')) {
        result.push(`${indent}SEQUENCE {`);
        braceStack.push(Math.floor(originalIndent / 4));
      } else if (line.includes('SET')) {
        result.push(`${indent}SET {`);
        braceStack.push(Math.floor(originalIndent / 4));
      } else if (line.match(/^\[[0-9]+\]/)) {
        // Context-specific tags like [0], [1], etc.
        const tagMatch = line.match(/^(\[[0-9]+\])/);
        if (tagMatch) {
          result.push(`${indent}${tagMatch[1]} {`);
          braceStack.push(Math.floor(originalIndent / 4));
        }
      } else if (line.includes('INTEGER')) {
        const hexMatch = line.match(/INTEGER[^0-9a-fA-F]*([0-9a-fA-F\s]+)/);
        if (hexMatch) {
          const hexValue = hexMatch[1].replace(/\s+/g, '');
          const decimalValue = parseInt(hexValue, 16);
          result.push(`${indent}INTEGER 0x${hexValue.toLowerCase()} (${decimalValue} decimal)`);
        } else {
          result.push(`${indent}INTEGER`);
        }
      } else if (line.includes('OBJECT IDENTIFIER') || line.includes('OID')) {
        const oidMatch = line.match(/([0-9.]+)/);
        if (oidMatch) {
          const oid = oidMatch[1];
          // Common OID mappings
          const oidNames: { [key: string]: string } = {
            '1.2.840.113549.1.1.1': 'rsaEncryption',
            '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
            '2.5.4.3': 'commonName',
            '2.5.4.6': 'countryName',
            '2.5.4.7': 'localityName',
            '2.5.4.8': 'stateOrProvinceName',
            '2.5.4.10': 'organizationName',
            '2.5.4.11': 'organizationalUnitName',
            '2.5.29.14': 'subjectKeyIdentifier',
            '2.5.29.35': 'authorityKeyIdentifier',
            '2.5.29.31': 'cRLDistributionPoints',
            '1.3.6.1.5.5.7.1.1': 'authorityInfoAccess'
          };
          const name = oidNames[oid] ? ` (${oidNames[oid]})` : '';
          result.push(`${indent}OBJECTIDENTIFIER ${oid}${name}`);
        } else {
          result.push(`${indent}OBJECTIDENTIFIER`);
        }
      } else if (line.includes('UTF8String')) {
        const stringMatch = line.match(/UTF8String[^']*'([^']*)'/) || line.match(/UTF8String[^"]*"([^"]*)"/);
        if (stringMatch) {
          result.push(`${indent}UTF8String '${stringMatch[1]}'`);
        } else {
          result.push(`${indent}UTF8String`);
        }
      } else if (line.includes('PrintableString')) {
        const stringMatch = line.match(/PrintableString[^']*'([^']*)'/) || line.match(/PrintableString[^"]*"([^"]*)"/);
        if (stringMatch) {
          result.push(`${indent}PrintableString '${stringMatch[1]}'`);
        } else {
          result.push(`${indent}PrintableString`);
        }
      } else if (line.includes('UTCTime')) {
        const timeMatch = line.match(/UTCTime[^']*'([^']*)'/) || line.match(/UTCTime[^"]*"([^"]*)"/);
        if (timeMatch) {
          result.push(`${indent}UTCTime '${timeMatch[1]}'`);
        } else {
          result.push(`${indent}UTCTime`);
        }
      } else if (line.includes('GeneralizedTime')) {
        const timeMatch = line.match(/GeneralizedTime[^']*'([^']*)'/) || line.match(/GeneralizedTime[^"]*"([^"]*)"/);
        if (timeMatch) {
          result.push(`${indent}GeneralizedTime '${timeMatch[1]}'`);
        } else {
          result.push(`${indent}GeneralizedTime`);
        }
      } else if (line.includes('BIT STRING')) {
        const hexMatch = line.match(/BIT STRING[^0-9a-fA-F]*([0-9a-fA-F\s]+)/);
        if (hexMatch) {
          const hexValue = hexMatch[1].replace(/\s+/g, '');
          result.push(`${indent}BITSTRING 0x${hexValue.toLowerCase()} : 0 unused bit(s)`);
        } else {
          result.push(`${indent}BITSTRING`);
        }
      } else if (line.includes('OCTET STRING')) {
        const hexMatch = line.match(/OCTET STRING[^0-9a-fA-F]*([0-9a-fA-F\s]+)/);
        if (hexMatch) {
          const hexValue = hexMatch[1].replace(/\s+/g, '');
          result.push(`${indent}OCTETSTRING ${hexValue.toLowerCase()}`);
        } else {
          result.push(`${indent}OCTETSTRING`);
        }
      } else if (line.includes('NULL')) {
        result.push(`${indent}NULL`);
      } else if (line.includes('BOOLEAN')) {
        result.push(`${indent}BOOLEAN`);
      } else if (line.includes('ENUMERATED')) {
        const hexMatch = line.match(/ENUMERATED[^0-9a-fA-F]*([0-9a-fA-F\s]+)/);
        if (hexMatch) {
          const hexValue = hexMatch[1].replace(/\s+/g, '');
          const decimalValue = parseInt(hexValue, 16);
          result.push(`${indent}ENUMERATED 0x${hexValue.toLowerCase()} (${decimalValue} decimal)`);
        } else {
          result.push(`${indent}ENUMERATED`);
        }
      }
      
      // Check if we need to close braces based on indentation
      const currentIndentLevel = Math.floor(originalIndent / 4);
      while (braceStack.length > 0 && braceStack[braceStack.length - 1] >= currentIndentLevel && i < lines.length - 1) {
        const nextLine = lines[i + 1];
        const nextIndentLevel = Math.floor((nextLine.length - nextLine.trimStart().length) / 4);
        if (nextIndentLevel <= braceStack[braceStack.length - 1]) {
          const braceIndent = '   '.repeat(braceStack.pop()!);
          result.push(`${braceIndent}}`);
        } else {
          break;
        }
      }
    }
    
    // Close remaining braces
    while (braceStack.length > 0) {
      const braceIndent = '   '.repeat(braceStack.pop()!);
      result.push(`${braceIndent}}`);
    }
    
    return result.join('\n');
  };

  // Tree Node Component
  const TreeNode: React.FC<TreeNodeProps> = ({ node, expandedNodes, onToggle, onHover, mergedView }) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.hasChildren;

    const handleMouseEnter = () => {
      if (node.byteStart !== undefined && node.byteEnd !== undefined) {
        onHover({ start: node.byteStart, end: node.byteEnd });
      }
    };

    const handleMouseLeave = () => {
      onHover(null);
    };

    return (
      <div className="select-none">
        <div 
          className={`flex items-center font-mono text-xs leading-tight tracking-tight py-0.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer ${hasChildren ? '' : 'ml-4'}`}
          style={{ 
            paddingLeft: `${node.indentLevel * 12}px`,
            fontFamily: 'ui-monospace, "SF Mono", "Monaco", "Menlo", "Consolas", "Liberation Mono", monospace'
          }}
          onClick={() => hasChildren && onToggle(node.id)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {hasChildren && (
            <div className="flex items-center justify-center w-4 h-4 mr-1">
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-gray-500" />
              ) : (
                <ChevronRight className="w-3 h-3 text-gray-500" />
              )}
            </div>
          )}
          
          {mergedView ? (
            // Merged view: ASN.1 structure on left, hex values on right
            <div className="flex w-full">
              <div className="flex-1">
                {formatLineContent(node.line)}
              </div>
              <div className="ml-4 text-gray-500 dark:text-gray-400 font-mono text-xs">
                {extractHexFromLine(node.line)}
              </div>
            </div>
          ) : (
            // Normal view: just the ASN.1 structure
            <div className="flex-1">
              {formatLineContent(node.line)}
            </div>
          )}
        </div>
        
        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => (
              <TreeNode 
                key={child.id} 
                node={child} 
                expandedNodes={expandedNodes} 
                onToggle={onToggle}
                onHover={onHover}
                mergedView={mergedView}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  // Format line content with syntax highlighting
  const formatLineContent = (line: string): JSX.Element => {
    const sequenceMatch = line.match(/^(.*?)(SEQUENCE|SET|OBJECT IDENTIFIER|INTEGER|BIT STRING|OCTET STRING|UTF8String|PrintableString|UTCTime|GeneralizedTime|NULL|BOOLEAN|ENUMERATED)\s*(.*)$/);
    const contextMatch = line.match(/^(\[[0-9]+\])\s*(.*)$/);
    
    if (contextMatch) {
      // Context-specific tags [0], [1], etc.
      return (
        <>
          <span className="text-purple-600 dark:text-purple-400 font-semibold">
            {contextMatch[1]}
          </span>
          {contextMatch[2] && (
            <span className="text-gray-700 dark:text-gray-300 ml-1">
              {contextMatch[2]}
            </span>
          )}
        </>
      );
    } else if (sequenceMatch) {
      // ASN.1 types with syntax highlighting
      return (
        <>
          {sequenceMatch[1] && (
            <span className="text-gray-600 dark:text-gray-400">
              {sequenceMatch[1]}
            </span>
          )}
          <span className={`font-semibold ${getTypeColor(sequenceMatch[2])}`}>
            {sequenceMatch[2]}
          </span>
          {sequenceMatch[3] && (
            <span className="text-gray-700 dark:text-gray-300 ml-1">
              {sequenceMatch[3]}
            </span>
          )}
        </>
      );
    } else {
      // Fallback for other lines
      return (
        <span className="text-gray-700 dark:text-gray-300">
          {line}
        </span>
      );
    }
  };

  // Format ASN.1 structure with tree visualization
  const formatASN1Tree = (structure: string): JSX.Element => {
    if (derDecoderView) {
      // Show DER decoder format
      const derFormat = convertToDerDecoderFormat(structure);
      return (
        <div className="font-mono text-xs leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
          {derFormat}
        </div>
      );
    }
    
    // Show normal tree view
    const treeNodes = parseASN1Tree(structure);
    
    return (
      <div className="space-y-0">
        {treeNodes.map(node => (
          <TreeNode 
            key={node.id} 
            node={node} 
            expandedNodes={expandedNodes} 
            onToggle={toggleNode}
            onHover={handleNodeHover}
            mergedView={mergedView}
          />
        ))}
      </div>
    );
  };

  // Get color for different ASN.1 types
  const getTypeColor = (type: string): string => {
    if (!colorsEnabled) return 'text-gray-700 dark:text-gray-300';
    
    switch (type) {
      case 'SEQUENCE':
      case 'SET':
        return 'text-blue-600 dark:text-blue-400';
      case 'OBJECT IDENTIFIER':
        return 'text-green-600 dark:text-green-400';
      case 'INTEGER':
      case 'BIT STRING':
      case 'OCTET STRING':
        return 'text-orange-600 dark:text-orange-400';
      case 'UTF8String':
      case 'PrintableString':
      case 'IA5String':
      case 'VisibleString':
        return 'text-pink-600 dark:text-pink-400';
      case 'UTCTime':
      case 'GeneralizedTime':
        return 'text-cyan-600 dark:text-cyan-400';
      case 'NULL':
      case 'BOOLEAN':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-indigo-600 dark:text-indigo-400';
    }
  };

  // Get color for ASN.1 tag bytes in hex dump
  const getHexTagColor = (hex: string): string => {
    if (!colorsEnabled) return 'text-gray-700 dark:text-gray-300';
    
    const upperHex = hex.toUpperCase();
    switch (upperHex) {
      case '30': // SEQUENCE
      case '31': // SET
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 font-semibold';
      case '06': // OBJECT IDENTIFIER
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 font-semibold';
      case '02': // INTEGER
        return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 font-semibold';
      case '03': // BIT STRING
        return 'text-orange-500 dark:text-orange-300 bg-orange-50 dark:bg-orange-950 font-semibold';
      case '04': // OCTET STRING
        return 'text-orange-700 dark:text-orange-500 bg-orange-50 dark:bg-orange-950 font-semibold';
      case '0C': // UTF8String
      case '13': // PrintableString
      case '16': // IA5String
      case '1A': // VisibleString
      case '1B': // GeneralString
      case '1C': // UniversalString
        return 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950 font-semibold';
      case '17': // UTCTime
      case '18': // GeneralizedTime
        return 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950 font-semibold';
      case '05': // NULL
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 font-semibold';
      case '01': // BOOLEAN
        return 'text-red-500 dark:text-red-300 bg-red-50 dark:bg-red-950 font-semibold';
      case '0A': // ENUMERATED
        return 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 font-semibold';
      default:
        return '';
    }
  };

  // Format hex dump with ASN.1 syntax highlighting
  const formatHexDump = (hexDump: string): JSX.Element => {
    const lines = hexDump.split('\n');
    let absoluteByteIndex = 0; // Track absolute byte position across all lines
    
    return (
      <div className="space-y-0">
        {lines.map((line, lineIndex) => {
          if (!line.trim()) return <div key={lineIndex} className="h-1" />;
          
          // Try to parse hex dump line format: "offset: hex bytes  ascii"
          const hexMatch = line.match(/^([0-9a-fA-F]{4,8}):\s+([0-9a-fA-F\s]+)\s+(.*)$/);
          
          if (hexMatch) {
            // Traditional hex dump format with offset
            const [, offset, hexPart, asciiPart] = hexMatch;
            const hexBytes = hexPart.trim().split(/\s+/).filter(byte => byte.length === 2);
            const lineStartByteIndex = absoluteByteIndex;
            
            return (
              <div key={lineIndex} className="font-mono text-xs leading-tight tracking-tight">
                {/* Offset */}
                <span className="text-gray-500 dark:text-gray-400 mr-2 font-medium">
                  {offset}:
                </span>
                
                {/* Hex bytes with enhanced highlighting */}
                <span className="mr-4">
                  {hexBytes.map((byte, byteIndex) => {
                    const currentBytePosition = lineStartByteIndex + byteIndex;
                    const isHovered = hoveredByteRange && 
                      currentBytePosition >= hoveredByteRange.start && 
                      currentBytePosition < hoveredByteRange.end;
                    
                    let colorClass = '';
                    let title = '';
                    
                    // Apply hover highlighting first (takes priority)
                    if (isHovered) {
                      colorClass = 'bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 border border-yellow-400 dark:border-yellow-600';
                      title = `Hovered ASN.1 element byte at position ${currentBytePosition}: ${byte.toUpperCase()}`;
                    }
                    // Check if it's a known ASN.1 tag
                    else if (colorsEnabled) {
                      const tagColor = getHexTagColor(byte);
                      if (tagColor) {
                        colorClass = tagColor;
                        title = `ASN.1 Tag: ${byte.toUpperCase()}`;
                      } else {
                        colorClass = 'text-gray-700 dark:text-gray-300';
                        title = `Byte: ${byte.toUpperCase()}`;
                      }
                    } else {
                      colorClass = 'text-gray-700 dark:text-gray-300';
                      title = `Byte at position ${currentBytePosition}: ${byte.toUpperCase()}`;
                    }
                    
                    return (
                      <span
                        key={byteIndex}
                        className={`mr-1 px-0.5 rounded cursor-help ${colorClass}`}
                        title={title}
                      >
                        {byte.toUpperCase()}
                      </span>
                    );
                  })}
                </span>
                
                {/* ASCII representation */}
                <span className="text-gray-600 dark:text-gray-400 text-xs font-mono">
                  {asciiPart}
                </span>
              </div>
            );
            
            // Update absolute byte index after processing this line
            absoluteByteIndex += hexBytes.length;
          } else {
            // Simple hex bytes format (like in the screenshot)
            const hexBytes = line.trim().split(/\s+/).filter(byte => byte.match(/^[0-9a-fA-F]{2}$/i));
            
            if (hexBytes.length > 0) {
              const lineStartByteIndex = absoluteByteIndex;
              
              const result = (
                <div key={lineIndex} className="font-mono text-xs leading-tight tracking-tight">
                  {hexBytes.map((byte, byteIndex) => {
                    const currentBytePosition = lineStartByteIndex + byteIndex;
                    const isHovered = hoveredByteRange && 
                      currentBytePosition >= hoveredByteRange.start && 
                      currentBytePosition < hoveredByteRange.end;
                    
                    let colorClass = '';
                    let title = '';
                    
                    // Apply hover highlighting first (takes priority)
                    if (isHovered) {
                      colorClass = 'bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 border border-yellow-400 dark:border-yellow-600';
                      title = `Hovered ASN.1 element byte at position ${currentBytePosition}: ${byte.toUpperCase()}`;
                    }
                    // Check if it's a known ASN.1 tag
                    else if (colorsEnabled) {
                      const tagColor = getHexTagColor(byte);
                      if (tagColor) {
                        colorClass = tagColor;
                        title = `ASN.1 Tag: ${byte.toUpperCase()}`;
                      } else {
                        colorClass = 'text-gray-700 dark:text-gray-300';
                        title = `Byte: ${byte.toUpperCase()}`;
                      }
                    } else {
                      colorClass = 'text-gray-700 dark:text-gray-300';
                      title = `Byte at position ${currentBytePosition}: ${byte.toUpperCase()}`;
                    }
                    
                    return (
                      <span
                        key={byteIndex}
                        className={`mr-1 px-0.5 rounded cursor-help ${colorClass}`}
                        title={title}
                      >
                        {byte.toUpperCase()}
                      </span>
                    );
                  })}
                </div>
              );
              
              // Update absolute byte index after processing this line
              absoluteByteIndex += hexBytes.length;
              return result;
            } else {
              // Fallback for non-hex lines
              return (
                <div key={lineIndex} className="font-mono text-xs leading-tight tracking-tight text-gray-700 dark:text-gray-300">
                  {line}
                </div>
              );
            }
          }
        })}
      </div>
    );
  };

  const copyToClipboard = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Download as file
  const downloadAsFile = (content: string, filename: string): void => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">ASN.1 JavaScript Decoder</h1>
        <p className="text-muted-foreground">
          Decode and analyze ASN.1 structures from PEM, DER, or Base64 encoded data
        </p>
      </div>

      {/* Controls Section - Now at the top */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Input Data
            </CardTitle>
            <CardDescription>
              Upload a file or paste ASN.1 data in PEM, DER, or Base64 format
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="file-upload">Upload File</Label>
              <Input
                id="file-upload"
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pem,.der,.cer,.crt,.p7m,.p7s,.b64"
                className="cursor-pointer"
              />
            </div>

            {/* File info */}
            {selectedFile && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedFile.name}</span>
                  <Badge variant="secondary">{selectedFile.size} bytes</Badge>
                </div>
              </div>
            )}

            {/* Decode File Button */}
            {selectedFile && (
              <Button onClick={handleDecodeFile} disabled={isLoading} className="w-full">
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Decode File
              </Button>
            )}

            {/* Text Input */}
            <div className="space-y-2">
              <Label htmlFor="text-input">Or Paste Data</Label>
              <Textarea
                id="text-input"
                placeholder="Paste your ASN.1 data here (PEM, DER hex, or Base64)..."
                value={textAreaValue}
                onChange={(e) => setTextAreaValue(e.target.value)}
                rows={6}
                className="font-mono text-sm"
              />
            </div>

            {/* Decode Text Button */}
            <Button 
              onClick={handleDecodeText} 
              disabled={isLoading || !textAreaValue.trim()} 
              className="w-full"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Decode Text
            </Button>
          </CardContent>
        </Card>

        {/* Options Section */}
        <Card>
          <CardHeader>
            <CardTitle>Decoding Options</CardTitle>
            <CardDescription>
              Configure how ASN.1 data is processed and displayed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="want-hex" 
                checked={wantHex} 
                onCheckedChange={changeWantHex}
              />
              <Label htmlFor="want-hex">Show hex dump</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="trim-hex" 
                checked={trimHex} 
                onCheckedChange={changeTrimHex}
                disabled={!wantHex}
              />
              <Label htmlFor="trim-hex">Trim long hex strings</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="want-def" 
                checked={wantDef} 
                onCheckedChange={changeWantDef}
              />
              <Label htmlFor="want-def">Show type definitions</Label>
            </div>

            {/* Type definitions dropdown */}
            {wantDef && definitions.length > 0 && (
              <div className="space-y-2">
                <Label>Detected Type</Label>
                <Select value={selectedDefinition} onValueChange={changeDefinition}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a type definition..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific type</SelectItem>
                    {definitions.map((def, index) => (
                      <SelectItem key={index} value={def.type.description}>
                        {def.type.description} ({Math.round(def.match * 100)}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Status Info */}
            {isLoading && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-sm text-blue-700 dark:text-blue-300">Processing ASN.1 data...</span>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Results Section - Now below controls */}
      <div className="space-y-4">
        {/* Show Legend Button (when hidden) */}
        {decodedData && !showColorLegend && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowColorLegend(true)}
              className="text-blue-600 dark:text-blue-400"
            >
              <ChevronDown className="w-4 h-4 mr-1" />
              Show Color Legend
            </Button>
          </div>
        )}

        {/* Shared Color Legend */}
        {decodedData && <ColorLegend />}

        {/* Results */}
        {decodedData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Decoded Results
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(decodedData.structure)}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy Structure
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadAsFile(decodedData.structure, 'asn1-structure.txt')}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Side-by-side layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Structure View - Left Side */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">ASN.1 Structure</h3>
                    {/* Tree Controls */}
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => expandAll(parseASN1Tree(decodedData.structure))}
                        className="text-xs"
                      >
                        <ChevronDown className="w-3 h-3 mr-1" />
                        Expand All
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={collapseAll}
                        className="text-xs"
                      >
                        <ChevronRight className="w-3 h-3 mr-1" />
                        Collapse All
                      </Button>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border">
                    <div className="overflow-auto max-h-96">
                      {formatASN1Tree(decodedData.structure)}
                    </div>
                  </div>
                </div>

                {/* Hex Dump View - Right Side */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Hex Dump</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(decodedData.hexDump || '')}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy Hex
                    </Button>
                  </div>
                  
                  {decodedData.hexDump ? (
                    <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border">
                      <div className="overflow-auto max-h-96" style={{ fontFamily: 'ui-monospace, "SF Mono", "Monaco", "Menlo", "Consolas", "Liberation Mono", monospace' }}>
                        {formatHexDump(decodedData.hexDump)}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border">
                      <div className="text-muted-foreground text-center py-8">
                        Hex dump disabled in options
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Base64 Section - Full Width Below */}
              {decodedData.base64 && (
                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Base64 Encoded</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(decodedData.base64 || '')}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy Base64
                    </Button>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border">
                    <pre className="text-xs font-mono whitespace-pre-wrap overflow-auto max-h-32 text-gray-700 dark:text-gray-300 leading-tight tracking-tight break-all" style={{ fontFamily: 'ui-monospace, "SF Mono", "Monaco", "Menlo", "Consolas", "Liberation Mono", monospace' }}>
                      {decodedData.base64}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!decodedData && !isLoading && !error && (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-medium mb-2">Ready to Decode ASN.1 Data</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Upload a certificate file or paste ASN.1 data in the input section above to see the decoded structure and analysis.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ASN1DecoderComponent;