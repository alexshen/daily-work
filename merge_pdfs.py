#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
PDF合并脚本 - 使用PyMuPDF
功能：合并多个PDF文件，支持更复杂的操作
"""

import os
import sys
import fitz  # PyMuPDF


def merge_pdfs_pymupdf(input_files, output_file, add_toc=False):
    """
    使用PyMuPDF合并PDF文件
    
    Args:
        input_files: 输入的PDF文件路径列表
        output_file: 输出的合并文件路径
        add_toc: 是否添加目录（用文件名作为章节标题）
    """
    try:
        # 创建新的PDF文档
        merged_doc = fitz.open()
        
        # 用于存储目录信息
        toc = []
        page_count = 0
        
        for file_path in input_files:
            if not os.path.exists(file_path):
                print(f"警告: 文件不存在 - {file_path}")
                continue
                
            if not file_path.lower().endswith('.pdf'):
                print(f"警告: 跳过非PDF文件 - {file_path}")
                continue
                
            print(f"正在读取: {file_path}")
            
            # 打开PDF文件
            with fitz.open(file_path) as doc:
                # 如果添加目录，记录文件名和页数
                if add_toc:
                    filename = os.path.basename(file_path)
                    toc.append([1, filename, page_count + 1])
                
                # 将当前文档的所有页面插入到合并文档
                for page in doc:
                    merged_doc.insert_pdf(doc, from_page=page.number, to_page=page.number)
                    
                page_count += len(doc)
        
        # 添加目录
        if add_toc and toc:
            merged_doc.set_toc(toc)
            print(f"已添加目录，共 {len(toc)} 个项目")
        
        # 保存合并后的PDF
        merged_doc.save(output_file)
        merged_doc.close()
        
        print(f"\n✅ 合并成功！输出文件: {output_file}")
        print(f"总页数: {page_count}")
        return True
        
    except Exception as e:
        print(f"❌ 合并失败: {e}")
        return False


def merge_folder_pdfs(folder_path, output_file, recursive=False):
    """
    合并文件夹中的所有PDF文件
    
    Args:
        folder_path: 文件夹路径
        output_file: 输出文件路径
        recursive: 是否递归搜索子文件夹
    """
    pdf_files = []
    
    if recursive:
        # 递归查找所有PDF文件
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                if file.lower().endswith('.pdf'):
                    pdf_files.append(os.path.join(root, file))
    else:
        # 只查找当前文件夹
        for file in os.listdir(folder_path):
            if file.lower().endswith('.pdf'):
                pdf_files.append(os.path.join(folder_path, file))
    
    if not pdf_files:
        print(f"在 '{folder_path}' 中未找到PDF文件")
        return False
    
    # 按文件名排序
    pdf_files.sort()
    
    print(f"找到 {len(pdf_files)} 个PDF文件:")
    for f in pdf_files:
        print(f"  - {os.path.basename(f)}")
    
    return merge_pdfs_pymupdf(pdf_files, output_file, add_toc=True)


def main():
    """主函数 - 支持多种使用方式"""
    if len(sys.argv) < 2:
        print("=" * 50)
        print("PDF合并工具 (PyMuPDF版本)")
        print("=" * 50)
        print("\n使用方式:")
        print("  1. 合并指定文件:")
        print("     python merge_pdf.py file1.pdf file2.pdf output.pdf")
        print("  2. 合并文件夹中所有PDF:")
        print("     python merge_pdf.py --folder /path/to/folder output.pdf")
        print("  3. 递归合并文件夹及子文件夹:")
        print("     python merge_pdf.py --recursive /path/to/folder output.pdf")
        sys.exit(1)
    
    # 检查是否是文件夹模式
    if sys.argv[1] == '--folder':
        if len(sys.argv) < 4:
            print("错误: 请指定文件夹路径和输出文件")
            sys.exit(1)
        folder_path = sys.argv[2]
        output_file = sys.argv[3]
        merge_folder_pdfs(folder_path, output_file, recursive=False)
        
    elif sys.argv[1] == '--recursive':
        if len(sys.argv) < 4:
            print("错误: 请指定文件夹路径和输出文件")
            sys.exit(1)
        folder_path = sys.argv[2]
        output_file = sys.argv[3]
        merge_folder_pdfs(folder_path, output_file, recursive=True)
        
    else:
        # 文件列表模式
        output_file = sys.argv[-1]
        input_files = sys.argv[1:-1]
        merge_pdfs_pymupdf(input_files, output_file, add_toc=True)


if __name__ == "__main__":
    main()