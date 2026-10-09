<?php
/**
 * @package exp_oe_tiptap
 * @class   exp_oe_tiptapInfo
 **/

class exp_oe_tiptapInfo
{
    public static function info()
    {
        return array(
            'Name'      => 'Exponential Online Editor Tiptap',
            'Version'   => "0.1.0",
            'Author'    => '7x',
            'Copyright' => "Copyright (C) 1998 - 2026 7x & Exponential Foundation. All rights reserved.",
            'License'   => "GNU General Public License v2.0 (or any later version)",
            'Info_url'  => 'https://github.com/se7enxweb/exp_oe_tiptap',
            'Includes the following third-party software' => array(
                'Name'      => 'Tiptap',
                'Version'   => '3.31.4',
                'Copyright' => 'Copyright (C) 2025, Tiptap GmbH',
                'License'   => 'MIT License',
                'Info_url'  => 'https://tiptap.dev/',
            ),
        );
    }
}
