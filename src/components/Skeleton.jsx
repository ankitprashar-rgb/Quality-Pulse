import React from 'react';
import './Skeleton.css';

export default function Skeleton({ type = 'text', width, height, className = '' }) {
    const style = {};
    if (width) style.width = width;
    if (height) style.height = height;

    return (
        <div className={`skeleton ${type} ${className}`} style={style}></div>
    );
}
